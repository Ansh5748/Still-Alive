#!/usr/bin/env bash
# exit on error
set -o errexit

pip install -r requirements.txt

# Download FFmpeg static binary if not already present
if [ ! -d "ffmpeg_bin" ]; then
  echo "Installing FFmpeg static binaries for Render..."
  mkdir -p ffmpeg_bin
  cd ffmpeg_bin
  wget https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
  tar -xf ffmpeg-release-amd64-static.tar.xz --strip-components=1
  rm ffmpeg-release-amd64-static.tar.xz
  cd ..
fi

# Ensure ffmpeg is in PATH for the application
export PATH=$PATH:$(pwd)/ffmpeg_bin
echo "FFmpeg installed and added to PATH"
