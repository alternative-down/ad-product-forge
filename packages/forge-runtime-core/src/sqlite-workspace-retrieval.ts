import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

import { load as loadSqliteVec } from 'sqlite-vec';

import type {
  RetrievalDocumentSource,
  RetrievalSourceDocument,
  RetrievedDocument,
  TextEmbedder,
} from 'agent-runtime-core/integrations';

const require = createRequire(import.meta.url);
type SqliteStatement = {
  run(...values: unknown[]): unknown;
  get(...values: unknown[]): unknown;
  all(...values: unknown[]): unknown[];
};

type SqliteDatabase = {
  exec(sql: string): unknown;
  prepare(sql: string): SqliteStatement;
  loadExtension(path: string): void;
  close(): void;
};

const { DatabaseSync: NodeDatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (path: string, options: {
    allowExtension: boolean;
    open: boolean;
  }) => SqliteDatabase;
};

export type SqliteWorkspaceRetrievalOptions = {
  databasePath: string;
  source: RetrievalDocumentSource;
  embedder: TextEmbedder;
  graphNeighborCount?: number;
};

type StoredDocumentRow = {
  rowid: number;
  document_id: string;
  path: string;
  content_hash: string;
  text: string;
  embedding_json: string | null;
  metadata_json: string | null;
};

type GraphEdgeRow = {
  to_rowid: number;
  weight: number;
};

type SearchMode = 'hybrid' | 'vector' | 'bm25';

type SearchResultRow = {
  rowid: number;
  document_id: string;
  text: string;
  metadata_json: string | null;
  distance?: number;
  rank?: number;
};

type SearchCandidate = RetrievedDocument & {
  rowid: number;
};

type GraphSearchResult = {
  hit: boolean;
  score: number | null;
  context: string;
  relevantContextRaw: string | null;
  sourcesCount: number;
  sourcesJson: string | null;
  rawJson: string | null;
};

export class SqliteWorkspaceRetrieval {
  private readonly databasePath: string;
  private readonly source: RetrievalDocumentSource;
  private readonly embedder: TextEmbedder;
  private readonly graphNeighborCount: number;
  private db: SqliteDatabase | null = null;
  private vecReady = false;
  private vectorDimension: number | null = null;

  constructor(options: SqliteWorkspaceRetrievalOptions) {
    this.databasePath = options.databasePath;
    this.source = options.source;
    this.embedder = options.embedder;
    this.graphNeighborCount = options.graphNeighborCount ?? 6;
  }

  async refresh() {
    const documents = await this.source.loadDocuments();
    const db = this.getDb();
    const indexedDocuments = documents.map((document) => ({
      ...document,
      contentHash: hashText(document.text),
      path: resolveDocumentPath(document),
      metadataJson: document.metadata ? JSON.stringify(document.metadata) : null,
    }));
    const existingRows = this.listStoredDocuments(db);
    const existingByDocumentId = new Map(existingRows.map((row) => [row.document_id, row]));
    const nextDocumentIds = new Set(indexedDocuments.map((document) => document.id));
    const removedRows = existingRows.filter((row) => !nextDocumentIds.has(row.document_id));
    const changedDocuments = indexedDocuments.filter((document) => {
      const existingRow = existingByDocumentId.get(document.id);

      if (!existingRow) {
        return true;
      }

      return existingRow.content_hash !== document.contentHash;
    });

    if (removedRows.length === 0 && changedDocuments.length === 0) {
      return;
    }

    if (changedDocuments.length > 0) {
      const embeddings = await this.embedder.embed({
        texts: changedDocuments.map((document) => document.text),
      });
      const firstVector = embeddings.vectors[0] ?? [];

      if (firstVector.length > 0) {
        this.ensureVectorTable(db, firstVector.length);
      }

      db.exec('begin immediate');

      try {
        for (const row of removedRows) {
          this.deleteDocument(db, row.rowid);
        }

        for (const [index, document] of changedDocuments.entries()) {
          const rowid = this.upsertDocument(db, document);
          const vector = embeddings.vectors[index] ?? [];

          if (vector.length > 0) {
            this.replaceVector(db, rowid, vector);
          }
        }

        this.rebuildGraph(db);
        db.exec('commit');
      } catch (error) {
        db.exec('rollback');
        throw error instanceof Error ? error : new Error(String(error));
      }

      return;
    }

    db.exec('begin immediate');

    try {
      for (const row of removedRows) {
        this.deleteDocument(db, row.rowid);
      }

      this.rebuildGraph(db);
      db.exec('commit');
    } catch (error) {
      db.exec('rollback');
      throw error instanceof Error ? error : new Error(String(error));
    }

  }

  async search(
    query: string,
    options: {
      topK: number;
      resultLimit?: number;
      scoreThreshold?: number;
      mode: SearchMode;
    },
  ): Promise<RetrievedDocument[]> {
    const queryText = query.trim();

    if (!queryText) {
      return [];
    }

    const db = this.getDb();
    const candidates = new Map<number, SearchCandidate>();
    const scoreThreshold = Math.max(0, Math.min(options.scoreThreshold ?? 0, 1));
    const resultLimit = Math.max(1, options.resultLimit ?? options.topK);
    const queryVector = options.mode === 'bm25'
      ? []
      : await this.embedQuery(queryText);

    if (options.mode !== 'bm25' && queryVector.length > 0 && this.vecReady) {
      for (const row of this.searchVectorRows(db, queryVector, options.topK, scoreThreshold)) {
        const score = distanceToScore(row.distance ?? 1);
        const candidate = candidates.get(row.rowid);

        if (!candidate || score > candidate.score) {
          candidates.set(row.rowid, {
            rowid: row.rowid,
            id: row.document_id,
            text: row.text,
            score,
            metadata: parseMetadata(row.metadata_json),
          });
        }
      }
    }

    if (options.mode !== 'vector') {
      for (const row of this.searchKeywordRows(db, queryText, options.topK, scoreThreshold)) {
        const score = keywordRankToScore(row.rank ?? 0);
        const candidate = candidates.get(row.rowid);

        if (options.mode === 'hybrid' && !candidate && scoreThreshold > 0) {
          continue;
        }

        const mergedScore = candidate
          ? Math.max(candidate.score, (candidate.score * 0.45) + (score * 0.55))
          : score;

        candidates.set(row.rowid, {
          rowid: row.rowid,
          id: row.document_id,
          text: row.text,
          score: mergedScore,
          metadata: parseMetadata(row.metadata_json),
        });
      }
    }

    return [...candidates.values()]
      .sort((left, right) => right.score - left.score)
      .slice(0, resultLimit)
      .map(({ rowid: _rowid, ...result }) => result);
  }

  async searchGraph(input: {
    query: string;
    topK: number;
    threshold: number;
    randomWalkSteps: number;
    includeSources: boolean;
  }): Promise<GraphSearchResult> {
    const queryText = input.query.trim();

    if (!queryText || !this.vecReady) {
      return emptyGraphResult();
    }

    const db = this.getDb();
    const queryVector = await this.embedQuery(queryText);

    if (queryVector.length === 0) {
      return emptyGraphResult();
    }

    const seedRows = this.searchVectorRows(
      db,
      queryVector,
      Math.max(input.topK, this.graphNeighborCount),
      input.threshold,
    )
      .map((row) => ({
        rowid: row.rowid,
        score: distanceToScore(row.distance ?? 1),
      }))
      .filter((row) => row.score >= input.threshold);

    if (seedRows.length === 0) {
      return emptyGraphResult();
    }

    const frontier = [...seedRows];
    const visited = new Map<number, number>(seedRows.map((row) => [row.rowid, row.score]));
    let steps = 0;

    while (frontier.length > 0 && steps < input.randomWalkSteps) {
      const current = frontier.shift()!;
      const edgeRows = this.listGraphEdges(db, current.rowid);

      for (const edge of edgeRows) {
        const propagatedScore = current.score * edge.weight;
        const existingScore = visited.get(edge.to_rowid) ?? 0;

        if (propagatedScore <= existingScore || propagatedScore < input.threshold * 0.5) {
          continue;
        }

        visited.set(edge.to_rowid, propagatedScore);
        frontier.push({
          rowid: edge.to_rowid,
          score: propagatedScore,
        });
      }

      steps += 1;
    }

    const topNodes = [...visited.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, input.topK);

    if (topNodes.length === 0) {
      return emptyGraphResult();
    }

    const documents = topNodes
      .map(([rowid, score]) => {
        const row = this.getStoredDocumentByRowid(db, rowid);

        if (!row) {
          return null;
        }

        return {
          row,
          score,
        };
      })
      .filter((value): value is { row: StoredDocumentRow; score: number } => value !== null);

    if (documents.length === 0) {
      return emptyGraphResult();
    }

    const relevantContext = documents
      .map(({ row }) => `${row.path}\n${row.text}`.trim())
      .filter(Boolean)
      .join('\n\n');
    const sources = documents.map(({ row, score }) => ({
      id: row.document_id,
      path: row.path,
      score,
    }));

    return {
      hit: true,
      score: topNodes[0]?.[1] ?? null,
      context: relevantContext,
      relevantContextRaw: relevantContext,
      sourcesCount: sources.length,
      sourcesJson: input.includeSources ? JSON.stringify(sources, null, 2) : null,
      rawJson: JSON.stringify({
        seeds: seedRows,
        visited: [...visited.entries()].map(([rowid, score]) => ({ rowid, score })),
      }, null, 2),
    };
  }

  async queryVector(query: string | number[], topK: number) {
    if (!this.vecReady) {
      return [];
    }

    const queryVector = Array.isArray(query)
      ? query
      : await this.embedQuery(query);

    if (queryVector.length === 0) {
      return [];
    }

    return this.searchVectorRows(this.getDb(), queryVector, topK, 0).map((row) => ({
      id: row.document_id,
      text: row.text,
      score: distanceToScore(row.distance ?? 1),
      metadata: parseMetadata(row.metadata_json),
    }));
  }

  async getStats() {
    const db = this.getDb();
    const countRow = db.prepare(
      'select count(*) as count from retrieval_documents',
    ).get() as { count: number } | undefined;

    return {
      availableIndexes: [
        'sqlite-fts5',
        this.vecReady ? 'sqlite-vec' : null,
        'sqlite-graph',
      ].filter((value): value is string => value !== null),
      activeIndexStats: this.vecReady
        ? {
          dimension: this.vectorDimension ?? 0,
          count: countRow?.count ?? 0,
          metric: 'cosine',
        }
        : null,
    };
  }

  listDocuments() {
    const db = this.getDb();
    return this.listStoredDocuments(db).map((row) => ({
      id: row.document_id,
      text: row.text,
      metadata: parseMetadata(row.metadata_json),
    }));
  }

  dispose() {
    this.db?.close();
    this.db = null;
  }

  private getDb() {
    if (this.db) {
      return this.db;
    }

    const db = new NodeDatabaseSync(this.databasePath, {
      allowExtension: true,
      open: true,
    });

    loadSqliteVec(db);
    db.exec('pragma journal_mode = wal');
    db.exec('pragma synchronous = normal');
    db.exec('pragma foreign_keys = on');
    this.ensureSchema(db);
    this.db = db;
    return db;
  }

  private ensureSchema(db: SqliteDatabase) {
    db.exec(`
      create table if not exists retrieval_documents (
        document_id text primary key,
        path text not null,
        text text not null,
        content_hash text not null,
        embedding_json text,
        metadata_json text,
        updated_at integer not null
      );

      create virtual table if not exists retrieval_documents_fts using fts5(
        text,
        path,
        tokenize='unicode61'
      );

      create table if not exists retrieval_graph_edges (
        from_rowid integer not null,
        to_rowid integer not null,
        weight real not null,
        kind text not null,
        primary key (from_rowid, to_rowid, kind)
      );

      create index if not exists retrieval_graph_edges_from_idx
      on retrieval_graph_edges (from_rowid, weight desc);

      create table if not exists retrieval_meta (
        key text primary key,
        value text not null
      );
    `);

    const dimensionRow = db.prepare(
      "select value from retrieval_meta where key = 'vector_dimension'",
    ).get() as { value: string } | undefined;

    if (!dimensionRow) {
      return;
    }

    this.vectorDimension = Number(dimensionRow.value);
    this.vecReady = this.vectorDimension > 0;
  }

  private ensureVectorTable(db: SqliteDatabase, dimension: number) {
    if (this.vectorDimension === dimension && this.vecReady) {
      return;
    }

    if (this.vectorDimension !== null && this.vectorDimension !== dimension) {
      db.exec('drop table if exists retrieval_document_embeddings');
    }

    db.exec(`
      create virtual table if not exists retrieval_document_embeddings using vec0(
        embedding float[${dimension}] distance_metric=cosine
      );
    `);
    db.prepare(`
      insert into retrieval_meta (key, value)
      values ('vector_dimension', ?)
      on conflict(key) do update set value = excluded.value
    `).run(String(dimension));
    this.vectorDimension = dimension;
    this.vecReady = true;
  }

  private listStoredDocuments(db: SqliteDatabase) {
    return db.prepare(`
      select
        rowid,
        document_id,
        path,
        content_hash,
        text,
        embedding_json,
        metadata_json
      from retrieval_documents
      order by path asc, rowid asc
    `).all() as StoredDocumentRow[];
  }

  private getStoredDocumentByRowid(db: SqliteDatabase, rowid: number) {
    return db.prepare(`
      select
        rowid,
        document_id,
        path,
        content_hash,
        text,
        embedding_json,
        metadata_json
      from retrieval_documents
      where rowid = ?
    `).get(rowid) as StoredDocumentRow | undefined;
  }

  private upsertDocument(
    db: SqliteDatabase,
    document: RetrievalSourceDocument & {
      contentHash: string;
      path: string;
      metadataJson: string | null;
    },
  ) {
    db.prepare(`
      insert into retrieval_documents (
        document_id,
        path,
        text,
        content_hash,
        embedding_json,
        metadata_json,
        updated_at
      ) values (?, ?, ?, ?, ?, ?, ?)
      on conflict(document_id) do update set
        path = excluded.path,
        text = excluded.text,
        content_hash = excluded.content_hash,
        embedding_json = excluded.embedding_json,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `).run(
      document.id,
      document.path,
      document.text,
      document.contentHash,
      null,
      document.metadataJson,
      Date.now(),
    );
    const row = db.prepare(
      'select rowid from retrieval_documents where document_id = ?',
    ).get(document.id) as { rowid: number };

    db.prepare('insert or replace into retrieval_documents_fts (rowid, text, path) values (?, ?, ?)')
      .run(row.rowid, document.text, document.path);

    return row.rowid;
  }

  private replaceVector(db: SqliteDatabase, rowid: number, vector: number[]) {
    db.prepare(
      'delete from retrieval_document_embeddings where rowid = ?',
    ).run(BigInt(rowid));
    db.prepare(
      'insert into retrieval_document_embeddings (rowid, embedding) values (?, ?)',
    ).run(BigInt(rowid), JSON.stringify(vector));
    db.prepare(
      'update retrieval_documents set embedding_json = ? where rowid = ?',
    ).run(JSON.stringify(vector), rowid);
  }

  private deleteDocument(db: SqliteDatabase, rowid: number) {
    db.prepare('delete from retrieval_graph_edges where from_rowid = ? or to_rowid = ?').run(rowid, rowid);
    db.prepare('delete from retrieval_documents_fts where rowid = ?').run(rowid);

    if (this.vecReady) {
      db.prepare('delete from retrieval_document_embeddings where rowid = ?').run(BigInt(rowid));
    }

    db.prepare('delete from retrieval_documents where rowid = ?').run(rowid);
  }

  private rebuildGraph(db: SqliteDatabase) {
    db.prepare('delete from retrieval_graph_edges').run();

    if (!this.vecReady) {
      return;
    }

    const documents = this.listStoredDocuments(db);

    if (documents.length === 0) {
      return;
    }

    for (const document of documents) {
      const embeddingJson = document.embedding_json;

      if (!embeddingJson) {
        continue;
      }

      const neighbors = db.prepare(`
        select rowid, distance
        from retrieval_document_embeddings
        where embedding match ?
          and k = ?
        order by distance asc
      `).all(embeddingJson, this.graphNeighborCount + 1) as Array<{
        rowid: number;
        distance: number;
      }>;

      for (const neighbor of neighbors) {
        if (neighbor.rowid === document.rowid) {
          continue;
        }

        const weight = distanceToScore(neighbor.distance);

        if (weight <= 0) {
          continue;
        }

        this.insertGraphEdge(db, document.rowid, neighbor.rowid, weight, 'semantic');
        this.insertGraphEdge(db, neighbor.rowid, document.rowid, weight, 'semantic');
      }
    }
  }

  private insertGraphEdge(
    db: SqliteDatabase,
    fromRowid: number,
    toRowid: number,
    weight: number,
    kind: 'directory' | 'semantic',
  ) {
    db.prepare(`
      insert into retrieval_graph_edges (from_rowid, to_rowid, weight, kind)
      values (?, ?, ?, ?)
      on conflict(from_rowid, to_rowid, kind) do update set
        weight = excluded.weight
    `).run(fromRowid, toRowid, weight, kind);
  }

  private listGraphEdges(db: SqliteDatabase, rowid: number) {
    return db.prepare(`
      select to_rowid, weight
      from retrieval_graph_edges
      where from_rowid = ?
      order by weight desc, to_rowid asc
      limit ?
    `).all(rowid, this.graphNeighborCount) as GraphEdgeRow[];
  }

  private searchVectorRows(
    db: SqliteDatabase,
    queryVector: number[],
    topK: number,
    scoreThreshold: number,
  ) {
    if (!this.vecReady) {
      return [];
    }

    const maxDistance = Math.max(0, 1 - scoreThreshold);

    return db.prepare(`
      select
        retrieval_documents.rowid as rowid,
        retrieval_documents.document_id as document_id,
        retrieval_documents.text as text,
        retrieval_documents.metadata_json as metadata_json,
        retrieval_document_embeddings.distance as distance
      from retrieval_document_embeddings
      join retrieval_documents on retrieval_documents.rowid = retrieval_document_embeddings.rowid
      where retrieval_document_embeddings.embedding match ?
        and k = ?
        and retrieval_document_embeddings.distance <= ?
      order by retrieval_document_embeddings.distance asc
    `).all(JSON.stringify(queryVector), topK, maxDistance) as SearchResultRow[];
  }

  private searchKeywordRows(
    db: SqliteDatabase,
    queryText: string,
    topK: number,
    scoreThreshold: number,
  ) {
    const keywordQuery = buildKeywordMatchQuery(queryText);

    if (!keywordQuery) {
      return [];
    }

    return db.prepare(`
      select
        retrieval_documents.rowid as rowid,
        retrieval_documents.document_id as document_id,
        retrieval_documents.text as text,
        retrieval_documents.metadata_json as metadata_json,
        bm25(retrieval_documents_fts) as rank
      from retrieval_documents_fts
      join retrieval_documents on retrieval_documents.rowid = retrieval_documents_fts.rowid
      where retrieval_documents_fts match ?
        and (1.0 / (2.0 + abs(bm25(retrieval_documents_fts)))) >= ?
      order by rank asc
      limit ?
    `).all(keywordQuery, scoreThreshold > 0 ? scoreThreshold : 0, topK) as SearchResultRow[];
  }

  private async embedQuery(queryText: string) {
    const response = await this.embedder.embed({
      texts: [queryText],
    });

    return response.vectors[0] ?? [];
  }
}

function hashText(text: string) {
  return createHash('sha256')
    .update(text)
    .digest('hex');
}

function resolveDocumentPath(document: RetrievalSourceDocument) {
  const metadataPath = document.metadata?.path;

  if (typeof metadataPath === 'string' && metadataPath.length > 0) {
    return metadataPath;
  }

  return document.id;
}

function parseMetadata(value: string | null) {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed;
  } catch {
    return undefined;
  }
}

function distanceToScore(distance: number) {
  return Math.max(0, 1 - distance);
}

function buildKeywordMatchQuery(queryText: string) {
  const tokens = queryText
    .toLowerCase()
    .match(/[\p{L}\p{N}_]+/gu)
    ?.filter((token) => token.length >= 2) ?? [];

  if (tokens.length === 0) {
    return null;
  }

  const uniqueTokens = [...new Set(tokens)].slice(0, 12);
  return uniqueTokens.map((token) => `${token}*`).join(' OR ');
}

function keywordRankToScore(rank: number) {
  return 1 / (2 + Math.abs(rank));
}

function emptyGraphResult(): GraphSearchResult {
  return {
    hit: false,
    score: null,
    context: '',
    relevantContextRaw: null,
    sourcesCount: 0,
    sourcesJson: null,
    rawJson: null,
  };
}
