# Third-Party Licenses and Notices

This project (Video Merger GUI and Video Splitter GUI) is distributed under the MIT License (see `LICENSE`). It bundles or depends on third‑party software. The following is a non‑exhaustive overview of key components and their licenses; detailed license files are included in the packaged applications.

Major components
- Electron (MIT)
  - Electron bundles Chromium (multiple BSD‑style licenses). Packaged apps include `LICENSE.electron.txt` and `LICENSES.chromium.html`.
- ffmpeg-static (package under MIT) bundling FFmpeg executable(s)
  - FFmpeg and FFprobe are licensed under the LGPL/GPL licenses depending on build configuration. The bundled binaries include accompanying license files, typically named `ffmpeg(.exe).LICENSE` and `ffmpeg(.exe).README`, and/or `LICENSE` inside `node_modules/ffmpeg-static`.
  - Source code and official project: https://ffmpeg.org/
  - Common build source used by ffmpeg-static: https://github.com/BtbN/FFmpeg-Builds (GPL builds). See the included license files for exact terms.
- ffprobe-static (package under MIT) bundling FFprobe (part of FFmpeg)
  - License is the same as FFmpeg; see included license files under `node_modules/ffprobe-static` and project links above.

Other notable dependencies (licenses are generally MIT/ISC/BSD):
- electron-builder (MIT)
- @electron/packager (MIT)
- fluent-ffmpeg (MIT)
- pretty-bytes (MIT)
- prompts (MIT)
- ora (MIT)
- @vercel/ncc (MIT)
- pkg (MIT)

Packaging and distribution notes
- The packaged applications include third‑party license files under the `resources` directory (for example: `LICENSE.electron.txt`, `LICENSES.chromium.html`, and the `ffmpeg-static` folder with FFmpeg license files).
- When distributing binaries that include FFmpeg/FFprobe, ensure the corresponding license texts accompany the distribution (this project’s packages include them). If you redistribute the binaries separately, you must also include their licenses and, if required, provide access to the corresponding source code (see FFmpeg’s license for details).

Trademarks
All product names, logos, and brands are property of their respective owners. Use of these names, logos, and brands does not imply endorsement.
