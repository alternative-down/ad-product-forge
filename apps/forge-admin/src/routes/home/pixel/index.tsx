import { useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';

import { AgentAvatar, AdminButton, AdminLoadingState } from '@/components/admin';
import { Badge } from '@/components/ui/badge';
import { getAgents, getSystemSettings } from '@/lib/admin-api';
import { cn } from '@/lib/utils';
import type { AgentListItem } from '@/lib/admin-api/types';

export const Route = createFileRoute('/home/pixel/')({
  component: HomePixelRoute,
});

const TILE_SIZE = 16;
const SCALE = 3;
const SCENE_COLS = 21;
const SCENE_ROWS = 14;
const CANVAS_WIDTH = SCENE_COLS * TILE_SIZE * SCALE;
const CANVAS_HEIGHT = SCENE_ROWS * TILE_SIZE * SCALE;

const ASSET_URLS = {
  floorCool: '/pixel-agents/assets/floors/floor_1.png',
  floorWarm: '/pixel-agents/assets/floors/floor_7.png',
  floorLounge: '/pixel-agents/assets/floors/floor_0.png',
  desk: '/pixel-agents/assets/furniture/DESK/DESK_FRONT.png',
  chair: '/pixel-agents/assets/furniture/WOODEN_CHAIR/WOODEN_CHAIR_FRONT.png',
  pc1: '/pixel-agents/assets/furniture/PC/PC_FRONT_ON_1.png',
  pc2: '/pixel-agents/assets/furniture/PC/PC_FRONT_ON_2.png',
  pc3: '/pixel-agents/assets/furniture/PC/PC_FRONT_ON_3.png',
  shelf: '/pixel-agents/assets/furniture/DOUBLE_BOOKSHELF/DOUBLE_BOOKSHELF.png',
  plant: '/pixel-agents/assets/furniture/PLANT/PLANT.png',
  painting: '/pixel-agents/assets/furniture/LARGE_PAINTING/LARGE_PAINTING.png',
  coffeeTable: '/pixel-agents/assets/furniture/COFFEE_TABLE/COFFEE_TABLE.png',
  sofa: '/pixel-agents/assets/furniture/SOFA/SOFA_FRONT.png',
  characters: [
    '/pixel-agents/assets/characters/char_0.png',
    '/pixel-agents/assets/characters/char_1.png',
    '/pixel-agents/assets/characters/char_2.png',
    '/pixel-agents/assets/characters/char_3.png',
    '/pixel-agents/assets/characters/char_4.png',
    '/pixel-agents/assets/characters/char_5.png',
  ],
} as const;

type LoadedImages = Record<string, HTMLImageElement>;

type SceneAgent = {
  agent: AgentListItem;
  x: number;
  y: number;
  dir: 'down' | 'up' | 'right' | 'left';
  frame: number;
  bubble: string | null;
};

function HomePixelRoute() {
  const settingsQuery = useQuery({
    queryKey: ['admin', 'system-settings'],
    queryFn: getSystemSettings,
  });
  const agentsQuery = useQuery({
    queryKey: ['admin', 'agents'],
    queryFn: getAgents,
    refetchInterval: 10_000,
  });
  const [tick, setTick] = useState(0);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [images, setImages] = useState<LoadedImages | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const agents = useMemo(() => agentsQuery.data ?? [], [agentsQuery.data]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((value) => value + 1);
    }, 180);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const urls = Object.values(ASSET_URLS).flatMap((value) => Array.isArray(value) ? value : [value]);

    void Promise.all(
      urls.map(async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        return [url, image] as const;
      }),
    ).then((entries) => {
      if (!active) {
        return;
      }

      setImages(Object.fromEntries(entries));
    });

    return () => {
      active = false;
    };
  }, []);

  const activeSelectedAgentId = selectedAgentId && agents.some((agent) => agent.agentId === selectedAgentId)
    ? selectedAgentId
    : agents[0]?.agentId ?? null;

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.agentId === activeSelectedAgentId) ?? null,
    [activeSelectedAgentId, agents],
  );

  const sceneAgents = useMemo(
    () => buildSceneAgents({
      agents,
      tick,
      selectedAgentId: activeSelectedAgentId,
    }),
    [activeSelectedAgentId, agents, tick],
  );

  useEffect(() => {
    if (!images || !canvasRef.current) {
      return;
    }

    renderScene({
      canvas: canvasRef.current,
      images,
      sceneAgents,
      tick,
    });
  }, [images, sceneAgents, tick]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Pixel Agents Study
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.06em] text-foreground sm:text-4xl">
            {settingsQuery.data?.companyName?.trim() || 'Empresa'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Canvas 2D com assets portados do pixel-agents para testar a linguagem visual.
          </p>
          {settingsQuery.isLoading && !settingsQuery.data ? <AdminLoadingState label="Carregando empresa..." /> : null}
        </div>

        <AdminButton
          type="button"
          variant="outline"
          onClick={() => {
            void agentsQuery.refetch();
            void settingsQuery.refetch();
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </AdminButton>
      </section>

      <section className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="rounded-[1.5rem] bg-[#f4efe7] p-3 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          <div className="relative overflow-hidden rounded-[1.25rem] bg-[#ddd4c7]">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="block h-auto w-full bg-[#ddd4c7]"
            />

            {sceneAgents.map((sceneAgent) => (
              sceneAgent.bubble ? (
                <div
                  key={`${sceneAgent.agent.agentId}:bubble`}
                  className="pointer-events-none absolute max-w-[15rem] -translate-x-1/2 rounded-[1rem] bg-background/96 px-3 py-2 text-xs leading-5 text-foreground shadow-[0_8px_18px_rgba(15,23,42,0.12)]"
                  style={{
                    left: `${(sceneAgent.x / (SCENE_COLS * TILE_SIZE)) * 100}%`,
                    top: `${((sceneAgent.y - 34) / (SCENE_ROWS * TILE_SIZE)) * 100}%`,
                  }}
                >
                  <div className="line-clamp-2">{sceneAgent.bubble}</div>
                </div>
              ) : null
            ))}
          </div>
        </div>

        <aside className="flex min-h-0 flex-col rounded-[1.4rem] bg-background/80 p-3">
          <div className="px-2 pb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Equipe
          </div>
          <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
            {agents.map((agent) => (
              <button
                key={agent.agentId}
                type="button"
                onClick={() => setSelectedAgentId(agent.agentId)}
                className={cn(
                  'flex items-center gap-3 rounded-[1rem] px-3 py-2 text-left transition-colors',
                  activeSelectedAgentId === agent.agentId ? 'bg-muted/60' : 'hover:bg-muted/35',
                )}
              >
                <AgentAvatar
                  agentId={agent.agentId}
                  name={agent.name}
                  className="h-10 w-10 border border-border/60 bg-muted"
                  fallbackClassName="bg-muted text-xs font-medium text-foreground"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{agent.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {agent.overview.lastStepPreview ?? humanizeAgentState(agent)}
                  </div>
                </div>
                <Badge variant="outline" className="rounded-full bg-background/90">
                  {humanizeAgentState(agent)}
                </Badge>
              </button>
            ))}
          </div>

          {selectedAgent ? (
            <div className="mt-3 rounded-[1.1rem] bg-muted/30 p-3">
              <div className="mb-1 text-sm font-medium text-foreground">{selectedAgent.name}</div>
              <div className="mb-2 text-xs text-muted-foreground">{selectedAgent.roleName ?? 'Sem papel'}</div>
              <div className="text-xs leading-5 text-foreground">
                {selectedAgent.overview.lastStepPreview ?? 'Sem preview recente.'}
              </div>
            </div>
          ) : null}
        </aside>
      </section>

      {agents.length === 0 && agentsQuery.isLoading ? <AdminLoadingState label="Carregando agentes..." /> : null}
      {agentsQuery.error ? <div className="text-sm text-destructive">{agentsQuery.error.message}</div> : null}
    </div>
  );
}

function buildSceneAgents(input: {
  agents: AgentListItem[];
  tick: number;
  selectedAgentId: string | null;
}) {
  const runningSlots = [
    { x: 4.5 * TILE_SIZE, y: 8.2 * TILE_SIZE, dir: 'down' as const },
    { x: 8.5 * TILE_SIZE, y: 8.2 * TILE_SIZE, dir: 'down' as const },
    { x: 4.5 * TILE_SIZE, y: 12.2 * TILE_SIZE, dir: 'down' as const },
    { x: 8.5 * TILE_SIZE, y: 12.2 * TILE_SIZE, dir: 'down' as const },
  ];
  const memorySlots = [
    { x: 14.5 * TILE_SIZE, y: 7.4 * TILE_SIZE, dir: 'left' as const },
    { x: 16.5 * TILE_SIZE, y: 7.4 * TILE_SIZE, dir: 'left' as const },
  ];
  const focusSlots = [
    { x: 14.2 * TILE_SIZE, y: 11.9 * TILE_SIZE, dir: 'down' as const },
    { x: 16 * TILE_SIZE, y: 11.9 * TILE_SIZE, dir: 'down' as const },
  ];
  const recoverySlots = [
    { x: 18.1 * TILE_SIZE, y: 3.2 * TILE_SIZE, dir: 'left' as const },
    { x: 18.1 * TILE_SIZE, y: 5.4 * TILE_SIZE, dir: 'left' as const },
  ];
  const roamLane = [
    { x: 10.5 * TILE_SIZE, y: 9.5 * TILE_SIZE, dir: 'right' as const },
    { x: 11.8 * TILE_SIZE, y: 9.5 * TILE_SIZE, dir: 'left' as const },
    { x: 10.5 * TILE_SIZE, y: 12.5 * TILE_SIZE, dir: 'right' as const },
  ];

  const runningAgents = input.agents.filter((agent) => agent.executionState === 'running' && !agent.overview.ltm.running);
  const memoryAgents = input.agents.filter((agent) => agent.overview.ltm.running);
  const absentAgents = input.agents.filter((agent) => agent.executionState === 'absent');
  const idleAgents = input.agents.filter((agent) => agent.executionState === 'idle' && !agent.overview.ltm.running);

  const sceneAgents: SceneAgent[] = [];

  for (const [index, agent] of runningAgents.entries()) {
    const slot = runningSlots[index % runningSlots.length] ?? roamLane[index % roamLane.length];
    sceneAgents.push({
      agent,
      x: slot.x + (index >= runningSlots.length ? Math.sin(input.tick / 5 + index) * 6 : 0),
      y: slot.y,
      dir: slot.dir,
      frame: 3 + (input.tick + index) % 2,
      bubble: agent.agentId === input.selectedAgentId ? agent.overview.lastStepPreview : null,
    });
  }

  for (const [index, agent] of memoryAgents.entries()) {
    const slot = memorySlots[index % memorySlots.length];
    sceneAgents.push({
      agent,
      x: slot.x,
      y: slot.y + Math.sin(input.tick / 5 + index) * 2,
      dir: slot.dir,
      frame: 5 + (input.tick + index) % 2,
      bubble: agent.agentId === input.selectedAgentId ? agent.overview.lastStepPreview : 'LTM ativa',
    });
  }

  for (const [index, agent] of idleAgents.entries()) {
    const slot = focusSlots[index % focusSlots.length] ?? roamLane[index % roamLane.length];
    sceneAgents.push({
      agent,
      x: slot.x + Math.sin(input.tick / 7 + index) * 4,
      y: slot.y,
      dir: slot.dir,
      frame: 1,
      bubble: agent.agentId === input.selectedAgentId ? agent.overview.lastStepPreview : null,
    });
  }

  for (const [index, agent] of absentAgents.entries()) {
    const slot = recoverySlots[index % recoverySlots.length];
    sceneAgents.push({
      agent,
      x: slot.x,
      y: slot.y,
      dir: slot.dir,
      frame: 6,
      bubble: agent.agentId === input.selectedAgentId ? agent.overview.lastStepPreview : 'Ausente / retry',
    });
  }

  return sceneAgents;
}

function renderScene(input: {
  canvas: HTMLCanvasElement;
  images: LoadedImages;
  sceneAgents: SceneAgent[];
  tick: number;
}) {
  const context = input.canvas.getContext('2d');

  if (!context) {
    return;
  }

  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, input.canvas.width, input.canvas.height);

  drawFloor(context, input.images);
  drawFurniture(context, input.images, input.tick);
  drawSceneAgents(context, input.images, input.sceneAgents);
}

function drawFloor(context: CanvasRenderingContext2D, images: LoadedImages) {
  const warmTile = images[ASSET_URLS.floorWarm];
  const coolTile = images[ASSET_URLS.floorCool];
  const loungeTile = images[ASSET_URLS.floorLounge];

  if (!warmTile || !coolTile || !loungeTile) {
    return;
  }

  context.fillStyle = '#ddd4c7';
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  for (let row = 0; row < SCENE_ROWS; row += 1) {
    for (let col = 0; col < SCENE_COLS; col += 1) {
      const dx = col * TILE_SIZE * SCALE;
      const dy = row * TILE_SIZE * SCALE;

      if (row < 2) {
        context.fillStyle = '#d2c8ba';
        context.fillRect(dx, dy, TILE_SIZE * SCALE, TILE_SIZE * SCALE);
        continue;
      }

      if (col < 10) {
        context.drawImage(warmTile, dx, dy, TILE_SIZE * SCALE, TILE_SIZE * SCALE);
        continue;
      }

      if (row > 9 && col > 10) {
        context.drawImage(loungeTile, dx, dy, TILE_SIZE * SCALE, TILE_SIZE * SCALE);
        continue;
      }

      context.drawImage(coolTile, dx, dy, TILE_SIZE * SCALE, TILE_SIZE * SCALE);
    }
  }

  context.fillStyle = '#cabda8';
  context.fillRect(0, 0, CANVAS_WIDTH, TILE_SIZE * SCALE * 2);
}

function drawFurniture(context: CanvasRenderingContext2D, images: LoadedImages, tick: number) {
  const items = [
    { key: ASSET_URLS.painting, x: 12, y: 1.3, w: 3, h: 2 },
    { key: ASSET_URLS.shelf, x: 15.5, y: 1.2, w: 2, h: 2 },
    { key: ASSET_URLS.plant, x: 18.4, y: 1.6, w: 1, h: 1 },
    { key: ASSET_URLS.desk, x: 3, y: 5, w: 3, h: 2 },
    { key: ASSET_URLS.desk, x: 7, y: 5, w: 3, h: 2 },
    { key: ASSET_URLS.desk, x: 3, y: 9, w: 3, h: 2 },
    { key: ASSET_URLS.desk, x: 7, y: 9, w: 3, h: 2 },
    { key: ASSET_URLS.chair, x: 4, y: 6.15, w: 1, h: 2 },
    { key: ASSET_URLS.chair, x: 8, y: 6.15, w: 1, h: 2 },
    { key: ASSET_URLS.chair, x: 4, y: 10.15, w: 1, h: 2 },
    { key: ASSET_URLS.chair, x: 8, y: 10.15, w: 1, h: 2 },
    { key: [ASSET_URLS.pc1, ASSET_URLS.pc2, ASSET_URLS.pc3][tick % 3], x: 4, y: 5.1, w: 1, h: 2 },
    { key: [ASSET_URLS.pc1, ASSET_URLS.pc2, ASSET_URLS.pc3][(tick + 1) % 3], x: 8, y: 5.1, w: 1, h: 2 },
    { key: [ASSET_URLS.pc1, ASSET_URLS.pc2, ASSET_URLS.pc3][(tick + 2) % 3], x: 4, y: 9.1, w: 1, h: 2 },
    { key: [ASSET_URLS.pc1, ASSET_URLS.pc2, ASSET_URLS.pc3][tick % 3], x: 8, y: 9.1, w: 1, h: 2 },
    { key: ASSET_URLS.sofa, x: 13.2, y: 10, w: 2, h: 2 },
    { key: ASSET_URLS.sofa, x: 15.3, y: 10, w: 2, h: 2 },
    { key: ASSET_URLS.coffeeTable, x: 14.4, y: 11.2, w: 1, h: 1 },
    { key: ASSET_URLS.plant, x: 18.3, y: 11.1, w: 1, h: 1 },
  ];

  for (const item of items) {
    const image = images[item.key];

    if (!image) {
      continue;
    }

    context.drawImage(
      image,
      Math.round(item.x * TILE_SIZE * SCALE),
      Math.round(item.y * TILE_SIZE * SCALE),
      image.width * SCALE,
      image.height * SCALE,
    );
  }
}

function drawSceneAgents(context: CanvasRenderingContext2D, images: LoadedImages, sceneAgents: SceneAgent[]) {
  const sortedAgents = [...sceneAgents].sort((left, right) => left.y - right.y);

  for (const sceneAgent of sortedAgents) {
    const image = images[ASSET_URLS.characters[Number.parseInt(sceneAgent.agent.agentId.slice(-1), 16) % ASSET_URLS.characters.length]]
      ?? images[ASSET_URLS.characters[0]];

    if (!image) {
      continue;
    }

    drawCharacterFrame({
      context,
      image,
      x: sceneAgent.x * SCALE,
      y: sceneAgent.y * SCALE,
      dir: sceneAgent.dir,
      frame: sceneAgent.frame,
    });
  }
}

function drawCharacterFrame(input: {
  context: CanvasRenderingContext2D;
  image: HTMLImageElement;
  x: number;
  y: number;
  dir: 'down' | 'up' | 'right' | 'left';
  frame: number;
}) {
  const sourceX = input.frame * 16;
  const sourceY = input.dir === 'down' ? 0 : input.dir === 'up' ? 32 : 64;
  const targetX = Math.round(input.x - (16 * SCALE) / 2);
  const targetY = Math.round(input.y - 32 * SCALE + 10);

  if (input.dir === 'left') {
    input.context.save();
    input.context.scale(-1, 1);
    input.context.drawImage(
      input.image,
      sourceX,
      64,
      16,
      32,
      -(targetX + 16 * SCALE),
      targetY,
      16 * SCALE,
      32 * SCALE,
    );
    input.context.restore();
    return;
  }

  input.context.drawImage(
    input.image,
    sourceX,
    sourceY,
    16,
    32,
    targetX,
    targetY,
    16 * SCALE,
    32 * SCALE,
  );
}

function humanizeAgentState(agent: AgentListItem) {
  if (agent.overview.ltm.running) {
    return 'LTM';
  }

  if (agent.executionState === 'running') {
    return 'Trabalhando';
  }

  if (agent.executionState === 'absent') {
    return 'Ausente';
  }

  return 'Ocioso';
}
