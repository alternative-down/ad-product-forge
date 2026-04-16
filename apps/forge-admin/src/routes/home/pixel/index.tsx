import { useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';

import { AdminButton, AdminLoadingState } from '@/components/admin';
import { getAgents, getSystemSettings } from '@/lib/admin-api';
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
  deskSide: '/pixel-agents/assets/furniture/DESK/DESK_SIDE.png',
  chairBack: '/pixel-agents/assets/furniture/WOODEN_CHAIR/WOODEN_CHAIR_BACK.png',
  chairSide: '/pixel-agents/assets/furniture/WOODEN_CHAIR/WOODEN_CHAIR_SIDE.png',
  pcBack: '/pixel-agents/assets/furniture/PC/PC_BACK.png',
  pcSide: '/pixel-agents/assets/furniture/PC/PC_SIDE.png',
  pc1: '/pixel-agents/assets/furniture/PC/PC_FRONT_ON_1.png',
  pc2: '/pixel-agents/assets/furniture/PC/PC_FRONT_ON_2.png',
  pc3: '/pixel-agents/assets/furniture/PC/PC_FRONT_ON_3.png',
  shelf: '/pixel-agents/assets/furniture/DOUBLE_BOOKSHELF/DOUBLE_BOOKSHELF.png',
  whiteboard: '/pixel-agents/assets/furniture/WHITEBOARD/WHITEBOARD.png',
  plant: '/pixel-agents/assets/furniture/PLANT/PLANT.png',
  plantLarge: '/pixel-agents/assets/furniture/LARGE_PLANT/LARGE_PLANT.png',
  painting: '/pixel-agents/assets/furniture/LARGE_PAINTING/LARGE_PAINTING.png',
  coffeeTable: '/pixel-agents/assets/furniture/COFFEE_TABLE/COFFEE_TABLE.png',
  sofa: '/pixel-agents/assets/furniture/SOFA/SOFA_FRONT.png',
  sofaBack: '/pixel-agents/assets/furniture/SOFA/SOFA_BACK.png',
  bin: '/pixel-agents/assets/furniture/BIN/BIN.png',
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
  toolBubble: AgentListItem['overview']['lastToolBadge'];
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
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [images, setImages] = useState<LoadedImages | null>(null);
  const [bubbleDeadlines, setBubbleDeadlines] = useState<Record<string, number>>({});
  const [animationDeadlines, setAnimationDeadlines] = useState<Record<string, number>>({});
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previousPreviewByAgentIdRef = useRef<Record<string, string | null>>({});
  const previousStepAtByAgentIdRef = useRef<Record<string, number | null>>({});
  const agents = useMemo(() => agentsQuery.data ?? [], [agentsQuery.data]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((value) => value + 1);
      setNowMs(Date.now());
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

  useEffect(() => {
    setBubbleDeadlines((currentDeadlines) => {
      const nextDeadlines: Record<string, number> = {};

      for (const agent of agents) {
        const previousPreview = previousPreviewByAgentIdRef.current[agent.agentId] ?? null;
        const currentPreview = agent.overview.lastStepPreview ?? null;
        const existingDeadline = currentDeadlines[agent.agentId] ?? 0;

        if (currentPreview && currentPreview !== previousPreview) {
          nextDeadlines[agent.agentId] = nowMs + 4_500;
        } else if (existingDeadline > nowMs) {
          nextDeadlines[agent.agentId] = existingDeadline;
        }

        previousPreviewByAgentIdRef.current[agent.agentId] = currentPreview;
      }

      return nextDeadlines;
    });
  }, [agents, nowMs]);

  useEffect(() => {
    setAnimationDeadlines((currentDeadlines) => {
      const nextDeadlines: Record<string, number> = {};

      for (const agent of agents) {
        const previousStepAt = previousStepAtByAgentIdRef.current[agent.agentId] ?? null;
        const currentStepAt = agent.overview.lastStepAt ?? null;
        const existingDeadline = currentDeadlines[agent.agentId] ?? 0;

        if (currentStepAt && currentStepAt !== previousStepAt) {
          nextDeadlines[agent.agentId] = nowMs + 3_600;
        } else if (existingDeadline > nowMs) {
          nextDeadlines[agent.agentId] = existingDeadline;
        }

        previousStepAtByAgentIdRef.current[agent.agentId] = currentStepAt;
      }

      return nextDeadlines;
    });
  }, [agents, nowMs]);

  const sceneAgents = useMemo(
    () => buildSceneAgents({
      agents,
      tick,
      nowMs,
      animationDeadlines,
      bubbleDeadlines,
    }),
    [agents, animationDeadlines, bubbleDeadlines, nowMs, tick],
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

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    function handleClick(event: MouseEvent) {
      const rect = canvas.getBoundingClientRect();
      const normalizedX = ((event.clientX - rect.left) / rect.width) * (SCENE_COLS * TILE_SIZE);
      const normalizedY = ((event.clientY - rect.top) / rect.height) * (SCENE_ROWS * TILE_SIZE);

      const hitAgent = [...sceneAgents]
        .reverse()
        .find((sceneAgent) => (
          normalizedX >= sceneAgent.x - 8 &&
          normalizedX <= sceneAgent.x + 8 &&
          normalizedY >= sceneAgent.y - 24 &&
          normalizedY <= sceneAgent.y + 8
        ));

      if (!hitAgent) {
        return;
      }

      setBubbleDeadlines((currentDeadlines) => ({
        ...currentDeadlines,
        [hitAgent.agent.agentId]: Date.now() + 4_500,
      }));
    }

    canvas.addEventListener('click', handleClick);

    return () => canvas.removeEventListener('click', handleClick);
  }, [sceneAgents]);

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

      <section className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 rounded-[1.5rem] bg-[#f4efe7] p-3 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          <div className="relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden rounded-[1.25rem] bg-[#ddd4c7]">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="block h-full max-h-full w-auto max-w-full bg-[#ddd4c7]"
            />

            {sceneAgents.map((sceneAgent) => {
              if (!sceneAgent.bubble) {
                return null;
              }

              const bubbleXPercent = (sceneAgent.x / (SCENE_COLS * TILE_SIZE)) * 100;
              const bubbleYPercent = ((sceneAgent.y - 44) / (SCENE_ROWS * TILE_SIZE)) * 100;
              const bubbleOffsetPx = sceneAgent.x < (SCENE_COLS * TILE_SIZE) / 2 ? 42 : -42;

              return (
                <div
                  key={`${sceneAgent.agent.agentId}:bubble`}
                  className="pointer-events-none absolute max-w-[15rem] rounded-[1rem] bg-background/96 px-3 py-2 text-xs leading-5 text-foreground shadow-[0_8px_18px_rgba(15,23,42,0.12)]"
                  style={{
                    left: `calc(${bubbleXPercent}% + ${bubbleOffsetPx}px)`,
                    top: `${bubbleYPercent}%`,
                    transform: sceneAgent.x < (SCENE_COLS * TILE_SIZE) / 2 ? 'translateX(0)' : 'translateX(-100%)',
                  }}
                >
                  <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {sceneAgent.toolBubble ? <span>{sceneAgent.toolBubble.icon}</span> : null}
                    <span>{sceneAgent.agent.name}</span>
                  </div>
                  <div className="line-clamp-2">{sceneAgent.bubble}</div>
                </div>
              );
            })}

            {sceneAgents.map((sceneAgent) => {
              if (sceneAgent.bubble || !sceneAgent.toolBubble) {
                return null;
              }

              const bubbleXPercent = (sceneAgent.x / (SCENE_COLS * TILE_SIZE)) * 100;
              const bubbleYPercent = ((sceneAgent.y - 28) / (SCENE_ROWS * TILE_SIZE)) * 100;
              const bubbleOffsetPx = sceneAgent.x < (SCENE_COLS * TILE_SIZE) / 2 ? 34 : -34;

              return (
                <div
                  key={`${sceneAgent.agent.agentId}:tool-bubble`}
                  className="pointer-events-none absolute flex h-8 w-8 items-center justify-center rounded-full bg-background/96 text-sm shadow-[0_8px_18px_rgba(15,23,42,0.12)]"
                  style={{
                    left: `calc(${bubbleXPercent}% + ${bubbleOffsetPx}px)`,
                    top: `${bubbleYPercent}%`,
                    transform: sceneAgent.x < (SCENE_COLS * TILE_SIZE) / 2 ? 'translateX(0)' : 'translateX(-100%)',
                  }}
                  title={sceneAgent.toolBubble.label}
                >
                  {sceneAgent.toolBubble.icon}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {agents.length === 0 && agentsQuery.isLoading ? <AdminLoadingState label="Carregando agentes..." /> : null}
      {agentsQuery.error ? <div className="text-sm text-destructive">{agentsQuery.error.message}</div> : null}
    </div>
  );
}

function buildSceneAgents(input: {
  agents: AgentListItem[];
  tick: number;
  nowMs: number;
  animationDeadlines: Record<string, number>;
  bubbleDeadlines: Record<string, number>;
}) {
  const runningSlots = [
    { x: 4 * TILE_SIZE, y: 6.2 * TILE_SIZE, dir: 'up' as const },
    { x: 8 * TILE_SIZE, y: 6.2 * TILE_SIZE, dir: 'up' as const },
    { x: 4 * TILE_SIZE, y: 10.6 * TILE_SIZE, dir: 'up' as const },
    { x: 8 * TILE_SIZE, y: 10.6 * TILE_SIZE, dir: 'up' as const },
  ];
  const memorySlots = [
    { x: 14.8 * TILE_SIZE, y: 5.8 * TILE_SIZE, dir: 'left' as const },
    { x: 17.4 * TILE_SIZE, y: 5.8 * TILE_SIZE, dir: 'left' as const },
  ];
  const focusSlots = [
    { x: 13.5 * TILE_SIZE, y: 11.2 * TILE_SIZE, dir: 'right' as const },
    { x: 15.4 * TILE_SIZE, y: 12.2 * TILE_SIZE, dir: 'left' as const },
    { x: 17.4 * TILE_SIZE, y: 11.4 * TILE_SIZE, dir: 'left' as const },
  ];
  const sofaRecoverySlots = [
    { x: 14.25 * TILE_SIZE, y: 10.55 * TILE_SIZE, dir: 'down' as const },
    { x: 16.35 * TILE_SIZE, y: 10.55 * TILE_SIZE, dir: 'down' as const },
  ];
  const roamLane = [
    { x: 11.2 * TILE_SIZE, y: 6.2 * TILE_SIZE, dir: 'right' as const },
    { x: 11.8 * TILE_SIZE, y: 9.4 * TILE_SIZE, dir: 'left' as const },
    { x: 11.2 * TILE_SIZE, y: 12.1 * TILE_SIZE, dir: 'right' as const },
  ];

  const runningAgents = input.agents.filter((agent) => agent.executionState === 'running' && !agent.overview.ltm.running);
  const memoryAgents = input.agents.filter((agent) => agent.overview.ltm.running);
  const absentAgents = input.agents.filter((agent) => agent.executionState === 'absent');
  const idleAgents = input.agents.filter((agent) => agent.executionState === 'idle' && !agent.overview.ltm.running);

  const sceneAgents: SceneAgent[] = [];

  for (const [index, agent] of runningAgents.entries()) {
    const slot = runningSlots[index % runningSlots.length] ?? roamLane[index % roamLane.length];
    const isAnimating = input.animationDeadlines[agent.agentId] > input.nowMs;
    const isRoaming = index >= runningSlots.length;
    const workPhase = Math.floor((input.tick + index * 17) / 7) % 8;
    const restingPhase = Math.floor((input.tick + index * 19) / 18) % 4;
    sceneAgents.push({
      agent,
      x: slot.x + (
        isAnimating && isRoaming
          ? Math.sin(input.tick / 4 + index) * 6
          : 0
      ),
      y: slot.y,
      dir: isAnimating
        ? workPhase === 3 ? 'left' : workPhase === 5 ? 'right' : slot.dir
        : restingPhase === 1 ? 'left' : restingPhase === 2 ? 'right' : slot.dir,
      frame: isAnimating
        ? workPhase === 0 || workPhase === 1 || workPhase === 6
          ? 3 + (input.tick + index) % 2
          : 1
        : 1,
      toolBubble: isAnimating ? agent.overview.lastToolBadge : null,
      bubble: input.bubbleDeadlines[agent.agentId] > input.nowMs ? agent.overview.lastStepPreview : null,
    });
  }

  for (const [index, agent] of memoryAgents.entries()) {
    const slot = memorySlots[index % memorySlots.length];
    const isAnimating = input.animationDeadlines[agent.agentId] > input.nowMs;
    const workPhase = Math.floor((input.tick + index * 13) / 8) % 6;
    const restingPhase = Math.floor((input.tick + index * 11) / 20) % 4;
    sceneAgents.push({
      agent,
      x: slot.x,
      y: slot.y,
      dir: isAnimating
        ? workPhase === 2 ? 'down' : slot.dir
        : restingPhase === 1 ? 'down' : restingPhase === 2 ? 'left' : slot.dir,
      frame: isAnimating
        ? workPhase === 0 || workPhase === 1 || workPhase === 4
          ? 5 + (input.tick + index) % 2
          : 1
        : restingPhase === 0 ? 5 : 1,
      toolBubble: isAnimating ? agent.overview.lastToolBadge : null,
      bubble: input.bubbleDeadlines[agent.agentId] > input.nowMs ? agent.overview.lastStepPreview : null,
    });
  }

  for (const [index, agent] of idleAgents.entries()) {
    const slot = focusSlots[index % focusSlots.length] ?? roamLane[index % roamLane.length];
    const isAnimating = input.animationDeadlines[agent.agentId] > input.nowMs;
    const roamPhase = input.tick / 12 + index * 1.7;
    const idlePhase = Math.floor((input.tick + index * 23) / 16) % 5;
    sceneAgents.push({
      agent,
      x: slot.x + (isAnimating ? Math.sin(input.tick / 8 + index) * 5 : Math.sin(roamPhase) * 4.5),
      y: slot.y + (isAnimating ? Math.cos(input.tick / 9 + index) * 2 : Math.cos(roamPhase * 0.8) * 2.2),
      dir: isAnimating
        ? index % 2 === 0 ? slot.dir : 'right'
        : idlePhase === 1 ? 'left' : idlePhase === 3 ? 'right' : Math.sin(roamPhase) > 0.35 ? 'right' : Math.sin(roamPhase) < -0.35 ? 'left' : 'down',
      frame: isAnimating
        ? (index % 3 === 0 ? 5 + (input.tick + index) % 2 : 1 + ((input.tick + index) % 2))
        : idlePhase === 0 ? 1 : idlePhase === 2 ? 0 : idlePhase === 4 ? 2 : 1,
      toolBubble: isAnimating ? agent.overview.lastToolBadge : null,
      bubble: input.bubbleDeadlines[agent.agentId] > input.nowMs ? agent.overview.lastStepPreview : null,
    });
  }

  for (const [index, agent] of absentAgents.entries()) {
    const slot = sofaRecoverySlots[index % sofaRecoverySlots.length];
    const isAnimating = input.animationDeadlines[agent.agentId] > input.nowMs;
    const restingPhase = Math.floor((input.tick + index * 29) / 22) % 4;
    sceneAgents.push({
      agent,
      x: slot.x + (isAnimating ? Math.sin(input.tick / 3 + index) * 3 : Math.sin(input.tick / 18 + index) * 0.35),
      y: slot.y + Math.sin(input.tick / 16 + index) * 0.35,
      dir: restingPhase === 1 ? 'left' : restingPhase === 2 ? 'right' : 'down',
      frame: restingPhase === 3 ? 0 : 1,
      toolBubble: isAnimating ? agent.overview.lastToolBadge : null,
      bubble: input.bubbleDeadlines[agent.agentId] > input.nowMs ? (agent.overview.lastStepPreview ?? 'Ausente / retry') : null,
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
  drawFurnitureBackground(context, input.images, input.tick);
  drawSceneAgents(context, input.images, input.sceneAgents);
  drawFurnitureForeground(context, input.images);
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

function drawFurnitureBackground(context: CanvasRenderingContext2D, images: LoadedImages, tick: number) {
  const items = [
    { key: ASSET_URLS.painting, x: 12.1, y: 1.2 },
    { key: ASSET_URLS.whiteboard, x: 15.4, y: 1.3 },
    { key: ASSET_URLS.shelf, x: 18.1, y: 1.25 },
    { key: ASSET_URLS.plantLarge, x: 13.1, y: 1.55 },
    { key: ASSET_URLS.plant, x: 19.2, y: 1.55 },
    { key: ASSET_URLS.desk, x: 2.6, y: 4.5 },
    { key: ASSET_URLS.desk, x: 6.6, y: 4.5 },
    { key: ASSET_URLS.desk, x: 2.6, y: 8.9 },
    { key: ASSET_URLS.desk, x: 6.6, y: 8.9 },
    { key: ASSET_URLS.pcBack, x: 3.45, y: 4.15 },
    { key: ASSET_URLS.pcBack, x: 7.45, y: 4.15 },
    { key: ASSET_URLS.pcBack, x: 3.45, y: 8.55 },
    { key: ASSET_URLS.pcBack, x: 7.45, y: 8.55 },
    { key: tick % 2 === 0 ? ASSET_URLS.pcSide : ASSET_URLS.pc1, x: 13.8, y: 5.0 },
    { key: tick % 2 === 0 ? ASSET_URLS.pcSide : ASSET_URLS.pc2, x: 16.5, y: 5.0 },
    { key: ASSET_URLS.deskSide, x: 13.2, y: 5.35 },
    { key: ASSET_URLS.deskSide, x: 15.9, y: 5.35 },
    { key: ASSET_URLS.sofaBack, x: 13.15, y: 10.05 },
    { key: ASSET_URLS.sofaBack, x: 15.25, y: 10.05 },
    { key: ASSET_URLS.coffeeTable, x: 14.45, y: 11.2 },
    { key: ASSET_URLS.bin, x: 10.9, y: 4.8 },
    { key: ASSET_URLS.bin, x: 10.9, y: 9.2 },
  ];

  drawFurnitureLayer(context, images, items);
}

function drawFurnitureForeground(context: CanvasRenderingContext2D, images: LoadedImages) {
  const items = [
    { key: ASSET_URLS.chairBack, x: 3.5, y: 6.75 },
    { key: ASSET_URLS.chairBack, x: 7.5, y: 6.75 },
    { key: ASSET_URLS.chairBack, x: 3.5, y: 11.15 },
    { key: ASSET_URLS.chairBack, x: 7.5, y: 11.15 },
    { key: ASSET_URLS.chairSide, x: 13.55, y: 6.05 },
    { key: ASSET_URLS.chairSide, x: 16.25, y: 6.05 },
    { key: ASSET_URLS.sofa, x: 13.15, y: 10.05 },
    { key: ASSET_URLS.sofa, x: 15.25, y: 10.05 },
    { key: ASSET_URLS.plant, x: 18.35, y: 11.0 },
  ];

  drawFurnitureLayer(context, images, items);
}

function drawFurnitureLayer(
  context: CanvasRenderingContext2D,
  images: LoadedImages,
  items: Array<{ key: string; x: number; y: number }>,
) {

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
