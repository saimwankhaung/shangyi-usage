param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
$sourceFile = Join-Path $PSScriptRoot '..\app\bridge\ShanGyiClaudeBridge.cs'
$compilerPath = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path -LiteralPath $compilerPath)) { throw 'The Windows .NET Framework C# compiler was not found.' }
# Version details shown in the file's Properties, taken from package.json.
$version = (Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot '..\package.json') | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw "Unexpected package version: $version" }
$assemblyInfo = Join-Path ([System.IO.Path]::GetTempPath()) ('ShanGyiBridgeInfo-' + [guid]::NewGuid() + '.cs')
@"
using System.Reflection;
[assembly: AssemblyTitle("ShanGyi Claude Bridge")]
[assembly: AssemblyDescription("ShanGyi Usage helper for the VS Code Claude Code extension")]
[assembly: AssemblyCompany("ShanGyi")]
[assembly: AssemblyProduct("ShanGyi Usage")]
[assembly: AssemblyCopyright("Copyright (c) 2026 ShanGyi. MIT License.")]
[assembly: AssemblyVersion("$version.0")]
[assembly: AssemblyFileVersion("$version.0")]
"@ | Set-Content -LiteralPath $assemblyInfo -Encoding UTF8
try {
  & $compilerPath /nologo /target:exe /platform:x64 /optimize+ /reference:System.Web.Extensions.dll ('/out:' + $Destination) $sourceFile $assemblyInfo
  if ($LASTEXITCODE -ne 0) { throw 'The VS Code helper could not be compiled.' }
} finally {
  Remove-Item -LiteralPath $assemblyInfo -ErrorAction SilentlyContinue
}
