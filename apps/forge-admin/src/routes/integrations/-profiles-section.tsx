import { Pencil, Power, PowerOff } from 'lucide-react';

import { AdminButton } from '@/components/admin';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import type { LlmProfile, UpsertLlmProfileInput } from '@/lib/admin-api';

export function ProfilesSection(input: {
  statusFilter: 'active' | 'inactive';
  profiles: LlmProfile[];
  pending: boolean;
  onStatusFilterChange(value: 'active' | 'inactive'): void;
  onCreate(): void;
  onEdit(profile: LlmProfile): void;
  onToggle(profile: LlmProfile): void;
  createProfileForm(profile: LlmProfile): UpsertLlmProfileInput;
}) {
  return (
    <section className="space-y-5 border-t border-border pt-6">
      <div className="space-y-1">
        <div className="text-lg font-semibold tracking-[-0.03em]">Perfis cadastrados</div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <Tabs
          value={input.statusFilter}
          onValueChange={(value) => input.onStatusFilterChange(value === 'inactive' ? 'inactive' : 'active')}
        >
          <TabsList className="h-auto justify-start gap-1 rounded-none bg-transparent p-0">
            <TabsTrigger
              value="active"
              className="h-9 rounded-sm px-3 py-2 text-sm text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground"
            >
              Ativos
            </TabsTrigger>
            <TabsTrigger
              value="inactive"
              className="h-9 rounded-sm px-3 py-2 text-sm text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground"
            >
              Inativos
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <AdminButton onClick={input.onCreate}>Novo</AdminButton>
      </div>

      <div className="w-full min-w-0 overflow-hidden rounded-sm border border-border">
        <Table className="text-sm">
          <TableHeader className="bg-muted/50 text-left text-muted-foreground">
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4 py-3 font-medium">Nome</TableHead>
              <TableHead className="px-4 py-3 text-right font-medium">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {input.profiles.map((profile) => (
              <TableRow key={profile.profileId}>
                <TableCell className="px-4 py-3">{profile.name}</TableCell>
                <TableCell className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <AdminButton variant="ghost" size="icon" onClick={() => input.onEdit(profile)}>
                      <Pencil className="h-4 w-4" />
                      <span className="sr-only">Editar</span>
                    </AdminButton>
                    <AdminButton
                      variant="ghost"
                      size="icon"
                      disabled={input.pending}
                      onClick={() => input.onToggle(profile)}
                    >
                      {profile.isEnabled ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                      <span className="sr-only">{profile.isEnabled ? 'Inativar' : 'Ativar'}</span>
                    </AdminButton>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {input.profiles.length === 0 ? (
              <TableRow>
                <TableCell className="px-4 py-6 text-muted-foreground" colSpan={2}>
                  {input.statusFilter === 'active' ? 'Nenhum perfil ativo.' : 'Nenhum perfil inativo.'}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
