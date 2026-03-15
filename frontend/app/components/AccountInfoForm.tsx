"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AccountInfo } from "@/app/lib/types";

interface AccountInfoFormProps {
  value: AccountInfo;
  onChange: (info: AccountInfo) => void;
}

export function AccountInfoForm({ value, onChange }: AccountInfoFormProps) {
  const update = (key: keyof AccountInfo) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [key]: e.target.value });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="name">Nama Pelanggan</Label>
        <Input
          id="name"
          placeholder="cth: Ahmad bin Ali"
          value={value.name}
          onChange={update("name")}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="account">Nombor Akaun</Label>
        <Input
          id="account"
          placeholder="cth: 191241505 (USD, Broker-Live, real, Hedge)"
          value={value.account}
          onChange={update("account")}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="company">Nama Syarikat Broker</Label>
        <Input
          id="company"
          placeholder="cth: Valetax International Limited"
          value={value.company}
          onChange={update("company")}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="date">Tarikh Laporan</Label>
        <Input
          id="date"
          placeholder="cth: 2026.03.04 15:35"
          value={value.date}
          onChange={update("date")}
        />
        <p className="text-xs text-muted-foreground">Format: YYYY.MM.DD HH:mm</p>
      </div>
    </div>
  );
}
