## Merge Videos

You can now merge multiple videos into one file:

1. Open the app.
2. Go to the **Merge Videos** section.
3. Select two or more video files.
4. Click **Merge Selected Videos**.
5. Choose where to save the merged video.

**Note:** Videos must have the same resolution, codec, and framerate for a lossless merge. If merge fails, consider re-encoding the files first.
# Video Splitter GUI

A simple Electron desktop app to split large video files into ~1.5 GB chunks or merge multiple videos into one, with a graphical interface.

## Features
- Select video file via file picker
- Splits into ~1.5 GB (configurable) segments
- Progress bar for each segment
- Option to delete original file after splitting
- **NEW:** Select multiple video files and merge them into one output video
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
4. To merge videos:
   - Click "Select Multiple Videos" and choose two or more files (same format/codec recommended).
   - Enter an output filename (or leave as output.mp4).
   - Click "Merge Videos". The merged file will be created in the same folder as the first input by default.

## Packaging

- To build standalone binaries, use the provided electron-builder scripts for your platform.

## License
MIT
