# hooks/scripts/tray.ps1
# Windows tray icon for an auto-started local Agents Observe server.
# Started by lib/local-server.mjs next to the server; exits when the server is gone.
#   -DashboardUrl  page opened from the icon
#   -HealthUrl     polled every 5 s; the icon disappears once it stops answering
#   -ServerPid     process tree stopped by "Stop server"
param(
  [Parameter(Mandatory = $true)][string]$DashboardUrl,
  [Parameter(Mandatory = $true)][string]$HealthUrl,
  [int]$ServerPid = 0
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# One tray icon per server: a second copy for the same health URL quits.
$mutexName = 'Global\AgentsObserveTray_' + ([BitConverter]::ToString(
    [Security.Cryptography.SHA1]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($HealthUrl))
  ) -replace '-', '')
$created = $false
$mutex = New-Object Threading.Mutex($true, $mutexName, [ref]$created)
if (-not $created) { exit 0 }

function New-DotIcon([Drawing.Color]$color) {
  $bmp = New-Object Drawing.Bitmap 16, 16
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([Drawing.Color]::Transparent)
  $g.FillEllipse((New-Object Drawing.SolidBrush $color), 1, 1, 14, 14)
  $g.DrawEllipse((New-Object Drawing.Pen ([Drawing.Color]::FromArgb(90, 0, 0, 0)), 1), 1, 1, 14, 14)
  $g.Dispose()
  [Drawing.Icon]::FromHandle($bmp.GetHicon())
}
$iconUp = New-DotIcon ([Drawing.Color]::FromArgb(34, 197, 94))
$iconWait = New-DotIcon ([Drawing.Color]::FromArgb(234, 179, 8))

$tray = New-Object Windows.Forms.NotifyIcon
$tray.Icon = $iconWait
$tray.Text = 'Agents Observe: starting...'
$tray.Visible = $true

$menu = New-Object Windows.Forms.ContextMenuStrip
$open = $menu.Items.Add('Open dashboard')
$open.Font = New-Object Drawing.Font($open.Font, [Drawing.FontStyle]::Bold)
$stop = $menu.Items.Add('Stop server')
[void]$menu.Items.Add('-')
$hide = $menu.Items.Add('Hide icon (server keeps running)')
$tray.ContextMenuStrip = $menu

$openDashboard = { Start-Process $DashboardUrl }
$open.add_Click($openDashboard)
$tray.add_DoubleClick($openDashboard)
$stop.add_Click({
    if ($ServerPid -gt 0) { & taskkill.exe /PID $ServerPid /T /F | Out-Null }
    [Windows.Forms.Application]::Exit()
  })
$hide.add_Click({ [Windows.Forms.Application]::Exit() })

function Test-Health {
  try {
    $req = [Net.WebRequest]::Create($HealthUrl)
    $req.Timeout = 2000
    $res = $req.GetResponse()
    $ok = [int]$res.StatusCode -eq 200
    $res.Close()
    return $ok
  } catch { return $false }
}

$script:seenUp = $false
$script:misses = 0
$script:started = Get-Date
$timer = New-Object Windows.Forms.Timer
$timer.Interval = 5000
$timer.add_Tick({
    if (Test-Health) {
      $script:misses = 0
      if (-not $script:seenUp) {
        $script:seenUp = $true
        $tray.Icon = $iconUp
        $tray.Text = 'Agents Observe: running'
      }
    } else {
      $script:misses++
      # Gone after it was up (auto-shutdown, crash), or never came up within 3 min.
      if (($script:seenUp -and $script:misses -ge 3) -or
          (-not $script:seenUp -and ((Get-Date) - $script:started).TotalMinutes -gt 3)) {
        [Windows.Forms.Application]::Exit()
      }
    }
  })
$timer.Start()

[Windows.Forms.Application]::Run()

$timer.Stop()
$tray.Visible = $false
$tray.Dispose()
$mutex.ReleaseMutex()
