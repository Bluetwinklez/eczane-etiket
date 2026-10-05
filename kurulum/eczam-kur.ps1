# Eczam Programı - Windows kurulum betiği
# Node.js ve Git yoksa winget ile kurar, programı indirir, masaüstüne kısayolları koyar
# ve bilgisayar açılınca sunucunun arka planda başlamasını sağlar.
# Tekrar çalıştırılırsa mevcut kurulumu günceller; veritabanına dokunmaz.
$ErrorActionPreference = 'Stop'
$Depo = 'https://github.com/Bluetwinklez/eczane-etiket.git'
$Klasor = if ($env:ECZAM_KLASOR) { $env:ECZAM_KLASOR } else { Join-Path $env:USERPROFILE 'Eczam' }

function Yaz([string]$m) { Write-Host "[Eczam] $m" -ForegroundColor Cyan }
function Hata([string]$m) { Write-Host "[Eczam] HATA: $m" -ForegroundColor Red; Read-Host 'Kapatmak için Enter'; exit 1 }
function YolYenile {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function NodeSurumu {
  try {
    $v = (& node -v) 2>$null
    if ($v -match '^v(\d+)\.(\d+)') { return [version]("{0}.{1}" -f $Matches[1], $Matches[2]) }
  } catch { }
  return $null
}
function WingetKur([string]$Kimlik, [string]$Ad) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Hata "$Ad bulunamadı ve winget yok. $Ad programını elle kurup bu betiği yeniden çalıştırın."
  }
  Yaz "$Ad kuruluyor (birkaç dakika sürebilir)..."
  winget install -e --id $Kimlik --accept-package-agreements --accept-source-agreements --silent
  YolYenile
}

Yaz "Kurulum klasörü: $Klasor"

# 1) Node.js 22.5 veya üstü
$nv = NodeSurumu
if (-not $nv -or $nv -lt [version]'22.5') {
  WingetKur 'OpenJS.NodeJS.LTS' 'Node.js'
  $nv = NodeSurumu
  if (-not $nv -or $nv -lt [version]'22.5') { Hata 'Node.js 22.5 veya üstü kurulamadı. https://nodejs.org adresinden LTS sürümünü kurun.' }
}
Yaz "Node.js $nv hazır."

# 2) Git (güncellemeler için)
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  WingetKur 'Git.Git' 'Git'
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Hata 'Git kurulamadı. https://git-scm.com adresinden kurun.' }
}

# 3) Programı indir veya güncelle
if (Test-Path (Join-Path $Klasor '.git')) {
  Yaz 'Mevcut kurulum bulundu, son sürüm alınıyor...'
  & git -C $Klasor pull --ff-only
  if ($LASTEXITCODE -ne 0) { Hata 'Güncelleme alınamadı (git pull). Klasörde elle değişiklik yapılmış olabilir.' }
} else {
  if ((Test-Path $Klasor) -and (Get-ChildItem $Klasor -Force | Select-Object -First 1)) { Hata "$Klasor klasörü dolu. Boşaltın ya da ECZAM_KLASOR ile başka bir klasör seçin." }
  Yaz 'Program indiriliyor...'
  & git clone $Depo $Klasor
  if ($LASTEXITCODE -ne 0) { Hata 'Program indirilemedi (git clone). İnternet bağlantısını kontrol edin.' }
}

# 4) Bağımlılıklar
Yaz 'Gerekli paketler kuruluyor...'
Push-Location (Join-Path $Klasor 'web')
& npm.cmd ci --omit=dev --no-audit --no-fund
$npmSonuc = $LASTEXITCODE
Pop-Location
if ($npmSonuc -ne 0) { Hata 'Paketler kurulamadı (npm ci).' }

# 5) Kısayollar: masaüstü (Eczam, Eczam Güncelle) ve açılışta arka planda başlatma
$Kurulum = Join-Path $Klasor 'kurulum'
$Ikon = Join-Path $Kurulum 'eczam.ico'
$Kabuk = New-Object -ComObject WScript.Shell
function Kisayol([string]$Yol, [string]$Hedef, [string]$Aciklama) {
  $k = $Kabuk.CreateShortcut($Yol)
  $k.TargetPath = $Hedef
  $k.WorkingDirectory = $Kurulum
  $k.IconLocation = $Ikon
  $k.Description = $Aciklama
  $k.Save()
}
$Masaustu = [Environment]::GetFolderPath('Desktop')
Kisayol (Join-Path $Masaustu 'Eczam.lnk') (Join-Path $Kurulum 'eczam-baslat.bat') 'Eczam Programı'
Kisayol (Join-Path $Masaustu 'Eczam Güncelle.lnk') (Join-Path $Kurulum 'eczam-guncelle.bat') 'Eczam Programını güncelle'
Kisayol (Join-Path ([Environment]::GetFolderPath('Startup')) 'Eczam Sunucu.lnk') (Join-Path $Kurulum 'eczam-gizli-baslat.vbs') 'Eczam sunucusu (arka plan)'

Yaz 'Kurulum tamam. Program açılıyor...'
Yaz 'İlk açılışta Windows Güvenlik Duvarı izin sorarsa "İzin ver" deyin (telefondan bağlanmak için gerekir).'
& (Join-Path $Kurulum 'eczam-baslat.bat')
