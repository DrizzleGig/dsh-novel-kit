param(
  [Parameter(Mandatory = $true)]
  [string]$Path
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Write-Failure([string]$Message) {
  @{ ok = $false; error = $Message; text = ''; lines = @() } | ConvertTo-Json -Compress -Depth 4
  exit 1
}

try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null

  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]

  function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
  }

  $OcrEngine = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType = WindowsRuntime]
  $StorageFile = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
  $FileAccessMode = [Windows.Storage.FileAccessMode, Windows.Storage, ContentType = WindowsRuntime]
  $BitmapDecoder = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
  $SoftwareBitmap = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
  $OcrResult = [Windows.Media.Ocr.OcrResult, Windows.Media.Ocr, ContentType = WindowsRuntime]

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    Write-Failure "file not found: $Path"
  }

  $engine = $OcrEngine::TryCreateFromUserProfileLanguages()
  if ($null -eq $engine) {
    Write-Failure 'no OCR language pack for the current user profile'
  }

  $file = Await ($StorageFile::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime])
  $stream = Await ($file.OpenAsync($FileAccessMode::Read)) ([Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime])
  $decoder = Await ($BitmapDecoder::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ($SoftwareBitmap)
  $result = Await ($engine.RecognizeAsync($bitmap)) ($OcrResult)

  $lines = @($result.Lines | ForEach-Object { [string]$_.Text } | Where-Object { $_.Trim().Length -gt 0 })
  $text = ($lines -join "`n")
  @{ ok = $true; lang = [string]$engine.RecognizerLanguage.LanguageTag; text = $text; lines = $lines } |
    ConvertTo-Json -Compress -Depth 4
} catch {
  Write-Failure ([string]$_.Exception.Message)
}
