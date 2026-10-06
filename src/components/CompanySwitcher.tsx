import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { useCompany } from "@/lib/company-context";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";

export function CompanySwitcher() {
  const { companies, activeCompany, loading, switchCompany } = useCompany();

  if (loading || !activeCompany) return null;

  const isManagementBook = activeCompany.code.endsWith("_MGMT");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 w-full min-w-0 max-w-[220px] justify-between gap-2 border border-border/60 bg-background/70 px-3 md:min-w-[220px] md:w-auto"
          aria-label="Select active company"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 text-left">
              <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                <span className="truncate">{activeCompany.display_name}</span>
                {isManagementBook && (
                  <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-800">
                    Internal
                  </span>
                )}
              </span>
              <span className="block text-[10px] text-muted-foreground">
                {activeCompany.code} · {activeCompany.base_currency}
              </span>
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(340px,calc(100vw-24px))] p-0">
        <Command>
          <CommandInput placeholder="Search company…" />
          <CommandList>
            <CommandEmpty>No company found.</CommandEmpty>
            <CommandGroup heading="Your companies">
              {companies.map((company) => {
                const management = company.code.endsWith("_MGMT");
                return (
                  <CommandItem
                    key={company.id}
                    value={company.display_name + " " + company.code}
                    onSelect={() => void switchCompany(company.id)}
                    className="py-3"
                  >
                    <Building2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    <span className="flex-1">
                      <span className="flex items-center gap-1.5 font-medium">
                        <span>{company.display_name}</span>
                        {management && (
                          <Badge variant="secondary" className="text-[9px] text-amber-800">
                            Internal
                          </Badge>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {company.code} · {company.base_currency}
                      </span>
                    </span>
                    {company.id === activeCompany.id && <Check className="h-4 w-4" aria-label="Active" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="border-t p-3 text-[11px] leading-5 text-muted-foreground">
          <div className="mb-1 flex items-center gap-2">
            <Badge variant="secondary">Active company</Badge>
            {isManagementBook && (
              <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Internal management book</Badge>
            )}
          </div>
          <p>
            Data is isolated by company. Management books are for internal analysis only and must not be used to omit taxable or statutory transactions from the official books.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}