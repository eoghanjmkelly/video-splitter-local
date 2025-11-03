# video-splitter-local

Desktop tools for splitting and merging large video files locally (Windows/macOS/Linux).

## Apps
- Video Merger GUI: Merge multiple clips into one, reorder before merge, optional delete originals after merge.
- Video Splitter GUI: Split a large video into ~size-based segments.

## Downloads
We publish builds on GitHub Releases. To download the latest version:

1. Go to the Releases page of this repo.
2. Pick the latest tag (e.g., v1.0.0) and download the asset for your platform:
	 - Windows: `VideoMergerGUI-windows-x64.zip` / `VideoSplitterGUI-windows-x64.zip` (portable)
	 - macOS: `*.dmg` (drag the app into Applications)
	 - Linux: pick one of:
		 - `*.AppImage` (portable; works on most distros: Ubuntu, Debian, Fedora, Arch). After download:
			 - `chmod +x *.AppImage`
			 - `./*.AppImage`
		 - `*.deb` for Debian/Ubuntu-based
			 - `sudo dpkg -i <file>.deb`
		 - `*.rpm` for Fedora/RHEL/openSUSE
			 - `sudo rpm -i <file>.rpm`

Direct links to the latest release assets (always point to the newest tag):

- Video Merger (Windows):
	- https://github.com/eoghanjmkelly/video-splitter-local/releases/latest/download/VideoMergerGUI-windows-x64.zip
- Video Merger (macOS DMG):
	- https://github.com/eoghanjmkelly/video-splitter-local/releases/latest/download/VideoMergerGUI-mac.dmg
- Video Merger (Linux):
	- AppImage: https://github.com/eoghanjmkelly/video-splitter-local/releases/latest/download/VideoMergerGUI-linux-x64.AppImage
	- DEB:      https://github.com/eoghanjmkelly/video-splitter-local/releases/latest/download/VideoMergerGUI-linux-x64.deb
	- RPM:      https://github.com/eoghanjmkelly/video-splitter-local/releases/latest/download/VideoMergerGUI-linux-x64.rpm

- Video Splitter (Windows):
	- https://github.com/eoghanjmkelly/video-splitter-local/releases/latest/download/VideoSplitterGUI-windows-x64.zip
- Video Splitter (macOS DMG):
	- https://github.com/eoghanjmkelly/video-splitter-local/releases/latest/download/VideoSplitterGUI-mac.dmg
- Video Splitter (Linux):
	- AppImage: https://github.com/eoghanjmkelly/video-splitter-local/releases/latest/download/VideoSplitterGUI-linux-x64.AppImage
	- DEB:      https://github.com/eoghanjmkelly/video-splitter-local/releases/latest/download/VideoSplitterGUI-linux-x64.deb
	- RPM:      https://github.com/eoghanjmkelly/video-splitter-local/releases/latest/download/VideoSplitterGUI-linux-x64.rpm

Notes:
- Windows SmartScreen may warn for unsigned apps. Click “More info” → “Run anyway”.
- macOS will warn if not notarized. Right‑click the app → Open → confirm. We can enable notarization once Apple Developer credentials are provided.
- Linux AppImage aims to run broadly across distros; if your system is very old or missing FUSE, use the `.deb`/`.rpm` instead.

## How releases are built
Tagging a commit like `v1.0.0` triggers CI to build and upload binaries automatically:

- Windows: portable zips (no install needed)
- macOS: DMG installers
- Linux: AppImage

## Development
Each app lives in its own folder:

- `video-merger-gui/`
- `video-splitter-gui/`

Quick start (dev):

```powershell
cd video-merger-gui
npm install
npm start
```

```powershell
cd video-splitter-gui
npm install
npm start
```

## License
MIT
