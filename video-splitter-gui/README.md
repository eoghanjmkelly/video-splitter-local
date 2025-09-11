# Video Splitter GUI

A simple Electron desktop app to split large video files into ~1.5 GB chunks with a graphical interface.

## Features
- Select video file via file picker
- Splits into ~1.5 GB (configurable) segments
- Progress bar for each segment
- Option to delete original file after splitting
- Minimal, fast, and low resource usage
- Cross-platform (Windows, macOS, Linux)

## Usage

1. Install dependencies:
   ```sh
   npm install
   ```
2. Start the app:
   ```sh
   npm start
   ```
3. Use the GUI to select a video, split, and (optionally) delete the original.

## Packaging

- To build standalone binaries, add electron-builder or similar to the build script.

## License
MIT
