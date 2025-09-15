# Video Merger GUI

A simple Electron desktop app to merge multiple video files into one with a graphical interface.

## Features
- Select multiple video files via file picker
- Merge into a single MP4 file
- Progress bar during merging
- Option to delete original files after merging
- Minimal, fast, and low resource usage
- Windows executable (packaged)

## Usage

1. Install dependencies:
   ```sh
   npm install
   ```
2. Start the app:
   ```sh
   npm start
   ```
3. Use the GUI to select videos, merge, and (optionally) delete the originals.

## Packaging

- To build a standalone Windows installer:
   ```sh
   npm run dist:win
   ```

## License
MIT
