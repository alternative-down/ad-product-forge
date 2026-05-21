import { AdminButton } from '@/components/admin';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { LlmProfile } from '@/lib/admin-api/index';

export function ProfileDefaultsSection(input: {
  enabledProfiles: LlmProfile[];
  primaryProfileId: string;
  omProfileId: string;
  hiringRhProfileId: string;
  primaryProfileName?: string;
  omProfileName?: string;
  hiringRhProfileName?: string;
  loading: boolean;
  pending: boolean;
  errorMessage?: string;
  onPrimaryProfileChange(value: string): void;
  onOmProfileChange(value: string): void;
  onHiringRhProfileChange(value: string): void;
  onSubmit(): void;
}) {
  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <div className="text-lg font-semibold tracking-[-0.03em]">Perfis padrão</div>
      </div>

      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          input.onSubmit();
        }}
      >
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
          <ProfileSelect
            id="default-primary-profile"
            label="Principal"
            value={input.primaryProfileId}
            displayValue={input.primaryProfileName}
            profiles={input.enabledProfiles}
            disabled={input.loading || input.pending || input.enabledProfiles.length === 0}
            onValueChange={input.onPrimaryProfileChange}
          />
          <ProfileSelect
            id="default-om-profile"
            label="OM"
            value={input.omProfileId}
            displayValue={input.omProfileName}
            profiles={input.enabledProfiles}
            disabled={input.loading || input.pending || input.enabledProfiles.length === 0}
            onValueChange={input.onOmProfileChange}
          />
          <ProfileSelect
            id="default-hiring-rh-profile"
            label="Hiring RH"
            value={input.hiringRhProfileId}
            displayValue={input.hiringRhProfileName}
            profiles={input.enabledProfiles}
            disabled={input.loading || input.pending || input.enabledProfiles.length === 0}
            onValueChange={input.onHiringRhProfileChange}
          />
        </div>
        {input.errorMessage ? (
          <div className="text-sm text-destructive">{input.errorMessage}</div>
        ) : null}
        <div className="flex justify-end">
          <AdminButton
            type="submit"
            disabled={
              input.loading ||
              input.pending ||
              input.enabledProfiles.length === 0 ||
              !input.primaryProfileId ||
              !input.omProfileId ||
              !input.hiringRhProfileId
            }
          >
            {input.pending ? 'Salvando...' : 'Salvar'}
          </AdminButton>
        </div>
      </form>
    </section>
  );
}

function ProfileSelect(input: {
  id: string;
  label: string;
  value: string;
  displayValue?: string;
  profiles: LlmProfile[];
  disabled: boolean;
  onValueChange(value: string): void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={input.id}>
        {input.label}
      </label>
      <Select value={input.value} onValueChange={input.onValueChange} disabled={input.disabled}>
        <SelectTrigger id={input.id} className="w-full">
          <SelectValue placeholder="Selecione um perfil">{input.displayValue}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {input.profiles.map((profile) => (
            <SelectItem key={profile.profileId} value={profile.profileId}>
              {profile.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
