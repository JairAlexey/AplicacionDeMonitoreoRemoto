export const PROXY_SCRIPTS = (
  port: number,
  host: string = process.env["PROXY_HOST"] || "127.0.0.1",
) => ({
  SET_PROXY_SETTINGS: `$regKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"
New-ItemProperty -Path $regKey -Name ProxyEnable -Value 1 -PropertyType DWord -Force | Out-Null
New-ItemProperty -Path $regKey -Name ProxyServer -Value "${host}:${port}" -PropertyType String -Force | Out-Null
New-ItemProperty -Path $regKey -Name ProxyOverride -Value "localhost;127.0.0.1;<local>" -PropertyType String -Force | Out-Null`,

  UNSET_PROXY_SETTINGS: `$regKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"
New-ItemProperty -Path $regKey -Name ProxyEnable -Value 0 -PropertyType DWord -Force | Out-Null
New-ItemProperty -Path $regKey -Name ProxyServer -Value "" -PropertyType String -Force | Out-Null
New-ItemProperty -Path $regKey -Name ProxyOverride -Value "" -PropertyType String -Force | Out-Null`,

  IS_PROXY_CONNECTED: `$proxyStatus = Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"
if ($proxyStatus.ProxyEnable -eq 1 -and $proxyStatus.ProxyServer -eq "${host}:${port}") {
    Write-Output "true"
} else {
    Write-Output "false"
}`,
});

export const SCRIPTS = {
  WINDOWS: {
    SET_PROXY: PROXY_SCRIPTS,
    UNSET_PROXY: PROXY_SCRIPTS,
    IS_PROXY_CONNECTED: PROXY_SCRIPTS,
  },
};
