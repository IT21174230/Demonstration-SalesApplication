$old = [Environment]::GetEnvironmentVariable('Path','User')
$entries = $old -split ';' | Where-Object { $_ -ne '' }

# Remove anaconda/conda entries
$entries = $entries | Where-Object { $_ -notmatch 'anaconda|conda' }

# Deduplicate (keep first occurrence, case-insensitive)
$seen = @{}
$unique = @()
foreach ($e in $entries) {
    $key = $e.ToLower().TrimEnd('\')
    if (-not $seen.ContainsKey($key)) {
        $seen[$key] = $true
        $unique += $e
    }
}

# Add Python312 base dir if missing
$py312 = 'C:\Users\tharu\AppData\Local\Programs\Python\Python312'
if (-not $seen.ContainsKey($py312.ToLower())) {
    $unique = @($py312) + $unique
}

$newPath = $unique -join ';'

Write-Host "`nOld length: $($old.Length) chars"
Write-Host "New length: $($newPath.Length) chars"
Write-Host "`nCleaned PATH entries:"
$unique | ForEach-Object { Write-Host "  $_" }

Write-Host "`n--- Applying new PATH ---"
[Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
Write-Host "Done. Restart any open terminals for it to take effect."
