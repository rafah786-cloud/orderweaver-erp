import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { useCompany } from "@/lib/company-context";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";

export function CompanySwitcher() {
  const { companies, activeCompany, loading, switchCompany } = useCompany();

  if (loading || !activeCompany) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="h-9 min-w-[220px] justify-between gap-3 border border-border/60 bg-background/70 px-3">
          <span className="flex min-w-0 items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 text-left">
              <span className="block truncate text-sm font-medium">{activeCompany.display_name}</span>
              <span className="block text-[10px] text-muted-foreground">{activeCompany.code} · {activeCompany.base_currency}</span>
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-0">
        <Command>
          <CommandInput placeholder="Search company…" />
          <CommandList>
            <CommandEmpty>No company found.</CommandEmpty>
            <CommandGroup heading="Your companies">
              {companies.map((company) => (
                <CommandItem
                  key={company.id}
                  value={`${company.display_name} ${company.code}`}
                  onSelect={() => void switchCompany(company.id)}
                  className="py-3"
                >
                  <Building2 className="mr-2 h-4 w-4" />
                  <span className="flex-1">
                    <span className="block font-medium">{company.display_name}</span>
                    <span className="text-xs text-muted-foreground">{company.code} · {company.base_currency}</span>
                  </span>
                  {company.id === activeCompany.id && <Check className="h-4 w-4" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="border-t p-2 text-[11px] text-muted-foreground">
          <Badge variant="secondary" className="mr-1">Active company</Badge>
          All accounting, inventory and transaction data is isolated to this company.
        </div>
      </PopoverContent>
    </Popover>
  );
}
