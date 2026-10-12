$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Xml.Linq

# Read-only inspection of the already-exported voucher XML. Never connects to or writes to Tally.
$path = ".\exports\probe\voucher-probe.xml"
if (!(Test-Path $path)) { throw "XML file not found: $path" }

function ChildValue($element, [string]$name) {
  foreach ($node in $element.Elements()) {
    if ($node.Name.LocalName -eq $name) { return $node.Value.Trim() }
  }
  return ""
}
function CleanXml([string]$raw) {
  $clean = [regex]::Replace($raw, '[\x00-\x08\x0B\x0C\x0E-\x1F]', '')
  return [regex]::Replace($clean, '(?i)&#(?:x0*[0-8bcef]|0*(?:[0-8]|1[1-2]|1[4-9]|2[0-9]|3[01]));', '')
}

$reader = [System.IO.StreamReader]::new((Resolve-Path $path))
$buffer = [System.Text.StringBuilder]::new()
$inside = $false
$shown = 0
$voucherCount = 0
try {
  while (($line = $reader.ReadLine()) -ne $null -and $shown -lt 5) {
    $position = 0
    while ($position -lt $line.Length -and $shown -lt 5) {
      if (-not $inside) {
        $start = [regex]::Match($line.Substring($position), '<VOUCHER\b[^>]*>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        if (-not $start.Success) { break }
        $position += $start.Index
        [void]$buffer.Clear()
        $inside = $true
      }
      $close = [regex]::Match($line.Substring($position), '</VOUCHER\s*>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
      if (-not $close.Success) {
        [void]$buffer.Append($line.Substring($position))
        [void]$buffer.AppendLine()
        $position = $line.Length
        continue
      }
      [void]$buffer.Append($line.Substring($position, $close.Index + $close.Length))
      $position += $close.Index + $close.Length
      $inside = $false
      try {
        $doc = [System.Xml.Linq.XDocument]::Parse((CleanXml $buffer.ToString()))
        $v = $doc.Root
        if ($null -ne $v -and @($v.Elements()).Count -gt 0) {
          $voucherCount++
          if ($voucherCount -le 5) {
            $shown++
            Write-Host ""
            Write-Host ("SAMPLE {0}: Date={1}; Type={2}; Number={3}; GUID={4}" -f $shown,(ChildValue $v "DATE"),(ChildValue $v "VOUCHERTYPENAME"),(ChildValue $v "VOUCHERNUMBER"),(ChildValue $v "GUID")) -ForegroundColor Cyan
            $ledger = @($v.Descendants() | Where-Object { $_.Name.LocalName -in @("ALLLEDGERENTRIES.LIST","LEDGERENTRIES.LIST") })
            Write-Host ("Ledger entry blocks: {0}" -f $ledger.Count)
            foreach ($e in $ledger | Select-Object -First 8) {
              Write-Host ("  LEDGER {0} | AMOUNT={1} | ISDEEMEDPOSITIVE={2}" -f (ChildValue $e "LEDGERNAME"),(ChildValue $e "AMOUNT"),(ChildValue $e "ISDEEMEDPOSITIVE"))
            }
            $inventory = @($v.Descendants() | Where-Object { $_.Name.LocalName -in @("ALLINVENTORYENTRIES.LIST","INVENTORYENTRIES.LIST") })
            Write-Host ("Inventory entry blocks: {0}" -f $inventory.Count)
            foreach ($e in $inventory | Select-Object -First 5) {
              Write-Host ("  STOCK {0} | ACTUALQTY={1} | BILLEDQTY={2} | RATE={3} | AMOUNT={4}" -f (ChildValue $e "STOCKITEMNAME"),(ChildValue $e "ACTUALQTY"),(ChildValue $e "BILLEDQTY"),(ChildValue $e "RATE"),(ChildValue $e "AMOUNT"))
              foreach ($a in @($e.Descendants() | Where-Object { $_.Name.LocalName -eq "ACCOUNTINGALLOCATIONS.LIST" } | Select-Object -First 5)) {
                Write-Host ("    ALLOCATION LEDGER={0} | AMOUNT={1} | ISDEEMEDPOSITIVE={2}" -f (ChildValue $a "LEDGERNAME"),(ChildValue $a "AMOUNT"),(ChildValue $a "ISDEEMEDPOSITIVE"))
              }
            }
            $allAmounts = @($v.Descendants() | Where-Object { $_.Name.LocalName -eq "AMOUNT" } | ForEach-Object { $_.Value.Trim() })
            Write-Host ("AMOUNT element count anywhere in voucher: {0}" -f $allAmounts.Count)
          }
        }
      } catch { Write-Warning ("Could not parse voucher fragment: " + $_.Exception.Message) }
      [void]$buffer.Clear()
    }
  }
} finally { $reader.Dispose() }
Write-Host ""
Write-Host ("Voucher fragments inspected: {0}" -f $shown)
Write-Host "This report is diagnostic only. It does not decide whether vouchers balance and does not modify Tally or ERP."
