$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Xml.Linq

# Read-only diagnostic. Does not alter the source XML or Tally.
$path = ".\exports\probe\voucher-probe.xml"
if (!(Test-Path $path)) { throw "XML file not found: $path" }

function Get-ChildValue($element, [string]$name) {
    foreach ($node in $element.Elements()) {
        if ($node.Name.LocalName -eq $name) { return $node.Value.Trim() }
    }
    return ""
}

function Remove-IllegalXmlCharacters([string]$raw) {
    return [regex]::Replace($raw, '[\x00-\x08\x0B\x0C\x0E-\x1F]', '')
}

$reader = [System.IO.StreamReader]::new((Resolve-Path $path))
$buffer = [System.Text.StringBuilder]::new()
$inside = $false
$matchedStarts = 0
$processed = 0
$parseErrors = 0
$firstParseError = ""
$nonZero = 0
$bothEntryKinds = 0
$shown = 0
$unclosedAtEof = $false

Write-Host "Streaming voucher diagnostics (read-only; supports multiple vouchers per line)..." -ForegroundColor Cyan
try {
    while (($line = $reader.ReadLine()) -ne $null) {
        $position = 0
        while ($position -lt $line.Length) {
            if (-not $inside) {
                $start = [regex]::Match($line.Substring($position), '<VOUCHER\b[^>]*>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
                if (-not $start.Success) { break }
                $matchedStarts++
                $position += $start.Index
                [void]$buffer.Clear()
                $inside = $true
            }

            $close = [regex]::Match($line.Substring($position), '</VOUCHER\s*>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
            if ($close.Success) {
                [void]$buffer.Append($line.Substring($position, $close.Index + $close.Length))
                $position += $close.Index + $close.Length
                $inside = $false

                $raw = Remove-IllegalXmlCharacters $buffer.ToString()
                try {
                    $doc = [System.Xml.Linq.XDocument]::Parse($raw)
                    $v = $doc.Root
                    if ($null -ne $v -and $v.Name.LocalName -eq "VOUCHER") {
                        $entries = @($v.Descendants() | Where-Object {
                            $_.Name.LocalName -in @("ALLLEDGERENTRIES.LIST", "LEDGERENTRIES.LIST")
                        })
                        $allCount = @($entries | Where-Object { $_.Name.LocalName -eq "ALLLEDGERENTRIES.LIST" }).Count
                        $legacyCount = @($entries | Where-Object { $_.Name.LocalName -eq "LEDGERENTRIES.LIST" }).Count
                        if ($allCount -gt 0 -and $legacyCount -gt 0) { $bothEntryKinds++ }

                        $sum = [decimal]0
                        $amountCount = 0
                        $detail = @()
                        foreach ($entry in $entries) {
                            $amountText = Get-ChildValue $entry "AMOUNT"
                            if (-not $amountText) { continue }
                            $amount = [decimal]0
                            $value = $amountText.Replace(",", "")
                            if (-not [decimal]::TryParse($value, [Globalization.NumberStyles]::Any, [Globalization.CultureInfo]::InvariantCulture, [ref]$amount)) { continue }
                            $sum += $amount
                            $amountCount++
                            if ($detail.Count -lt 12) {
                                $detail += ("{0} | {1} | ISDEEMEDPOSITIVE={2} | AMOUNT={3}" -f
                                    (Get-ChildValue $entry "LEDGERNAME"),
                                    $entry.Name.LocalName,
                                    (Get-ChildValue $entry "ISDEEMEDPOSITIVE"),
                                    $amountText)
                            }
                        }
                        $processed++
                        if ($amountCount -gt 0 -and [math]::Abs($sum) -ge 0.01) {
                            $nonZero++
                            if ($shown -lt 10) {
                                $shown++
                                Write-Host ""
                                Write-Host ("NON-ZERO SAMPLE #{0}: Date={1}; Type={2}; Number={3}; GUID={4}" -f
                                    $shown,
                                    (Get-ChildValue $v "DATE"),
                                    (Get-ChildValue $v "VOUCHERTYPENAME"),
                                    (Get-ChildValue $v "VOUCHERNUMBER"),
                                    (Get-ChildValue $v "GUID")) -ForegroundColor Yellow
                                Write-Host ("Entry types: ALLLEDGERENTRIES={0}; LEDGERENTRIES={1}; amount entries={2}; raw AMOUNT sum={3}" -f $allCount, $legacyCount, $amountCount, $sum)
                                $detail | ForEach-Object { Write-Host ("  " + $_) }
                            }
                        }
                    }
                } catch {
                    $parseErrors++
                    if (-not $firstParseError) { $firstParseError = $_.Exception.Message }
                    if ($parseErrors -le 5) { Write-Warning ("Unparsable voucher #{0}: {1}" -f $parseErrors, $_.Exception.Message) }
                }
                [void]$buffer.Clear()
            } else {
                [void]$buffer.Append($line.Substring($position))
                [void]$buffer.AppendLine()
                $position = $line.Length
            }
        }
    }
    if ($inside) { $unclosedAtEof = $true }
} finally {
    $reader.Dispose()
}

Write-Host ""
Write-Host "========== DIAGNOSTIC SUMMARY ==========" -ForegroundColor Cyan
Write-Host ("Voucher opening tags matched: {0}" -f $matchedStarts)
Write-Host ("Voucher records parsed successfully: {0}" -f $processed)
Write-Host ("Voucher parse errors: {0}" -f $parseErrors)
if ($firstParseError) { Write-Host ("First parse error: {0}" -f $firstParseError) }
Write-Host ("Vouchers with non-zero raw AMOUNT sum: {0}" -f $nonZero)
Write-Host ("Vouchers containing BOTH ledger-entry tag types: {0}" -f $bothEntryKinds)
Write-Host ("Unclosed voucher at end of file: {0}" -f $unclosedAtEof)
Write-Host "Compare opening-tag count, parsed count, and parse errors before interpreting any amount totals."
Write-Host "Diagnostic only: raw sums and sign fields are shown for inspection; no accounting verdict is made."
