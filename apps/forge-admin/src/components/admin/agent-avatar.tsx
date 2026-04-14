import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

type AgentAvatarProps = {
  agentId: string;
  name: string;
  size?: 'sm' | 'default' | 'lg';
  className?: string;
  fallbackClassName?: string;
};

export function AgentAvatar(input: AgentAvatarProps) {
  return (
    <Avatar size={input.size} className={input.className}>
      <AvatarImage
        src={buildAgentAvatarUrl(input.agentId, input.name)}
        alt={input.name}
      />
      <AvatarFallback className={input.fallbackClassName}>
        {getAgentInitials(input.name)}
      </AvatarFallback>
    </Avatar>
  );
}

function buildAgentAvatarUrl(agentId: string, name: string) {
  const seed = encodeURIComponent(`${agentId}:${name}`);
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${seed}`;
}

function getAgentInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return 'AG';
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
