"""
Video Processor
FFmpeg-based video processing for scene assembly and effects
"""

import os
import subprocess
import tempfile
import shutil
import ffmpeg


class VideoProcessor:
    """Processes scenes into a final video using FFmpeg"""

    def __init__(self, media_folder, output_config=None, progress_callback=None):
        self.media_folder = media_folder
        self.output_config = output_config or {}
        self.progress_callback = progress_callback or (lambda p, m: None)

        # Default output settings
        self.width = self.output_config.get('resolution', [1080, 1920])[0]
        self.height = self.output_config.get('resolution', [1080, 1920])[1]
        self.fps = self.output_config.get('fps', 30)
        self.codec = self.output_config.get('codec', 'h264')
        self.quality = self.output_config.get('quality', 'high')

        # Quality presets (FFmpeg CRF values - lower = better quality)
        self.quality_presets = {
            'low': {'crf': 28, 'preset': 'fast'},
            'medium': {'crf': 23, 'preset': 'medium'},
            'high': {'crf': 18, 'preset': 'slow'}
        }

    def _update_progress(self, progress, message):
        """Update progress callback"""
        self.progress_callback(progress, message)

    def _get_media_path(self, filename):
        """Get full path to media file"""
        if os.path.isabs(filename):
            return filename

        # Try different locations
        paths_to_try = [
            os.path.join(self.media_folder, filename),
            os.path.join(self.media_folder, 'images', filename),
            os.path.join(self.media_folder, 'media', filename),
            filename
        ]

        for path in paths_to_try:
            if os.path.exists(path):
                return path

        raise FileNotFoundError(f"Media file not found: {filename}")

    def _create_scene_clip(self, scene, temp_dir, index):
        """Create a video clip for a single scene"""
        media_file = scene.get('media_file')
        if not media_file:
            raise ValueError(f"Scene {scene.get('id')} has no media file")

        media_path = self._get_media_path(media_file)
        duration = scene.get('duration', 3)
        effect = scene.get('effect', {}).get('type', 'static')

        output_path = os.path.join(temp_dir, f"scene_{index:03d}.mp4")

        # Build FFmpeg command based on effect type
        input_stream = ffmpeg.input(media_path, loop=1, t=duration)

        # Scale and pad to target resolution
        processed = input_stream.filter(
            'scale',
            w=f'if(gte(iw/ih,{self.width}/{self.height}),{self.width},-2)',
            h=f'if(gte(iw/ih,{self.width}/{self.height}),-2,{self.height})'
        ).filter(
            'pad',
            w=self.width,
            h=self.height,
            x='(ow-iw)/2',
            y='(oh-ih)/2',
            color='black'
        )

        # Apply effect
        if effect == 'zoom_in':
            start_scale = scene.get('effect', {}).get('start_scale', 1.0)
            end_scale = scene.get('effect', {}).get('end_scale', 1.2)
            processed = self._apply_zoom_effect(processed, start_scale, end_scale, duration)
        elif effect == 'zoom_out':
            start_scale = scene.get('effect', {}).get('start_scale', 1.2)
            end_scale = scene.get('effect', {}).get('end_scale', 1.0)
            processed = self._apply_zoom_effect(processed, start_scale, end_scale, duration)
        elif effect == 'pan_left':
            processed = self._apply_pan_effect(processed, 'left', duration)
        elif effect == 'pan_right':
            processed = self._apply_pan_effect(processed, 'right', duration)
        elif effect == 'fade':
            processed = processed.filter('fade', type='in', start_time=0, duration=0.5)
            processed = processed.filter('fade', type='out', start_time=duration-0.5, duration=0.5)
        elif effect == 'shake':
            processed = self._apply_shake_effect(processed)

        # Set output format
        preset_config = self.quality_presets.get(self.quality, self.quality_presets['medium'])

        output = processed.output(
            output_path,
            vcodec='libx264',
            pix_fmt='yuv420p',
            r=self.fps,
            crf=preset_config['crf'],
            preset=preset_config['preset']
        )

        # Run FFmpeg
        output.overwrite_output().run(quiet=True)

        return output_path

    def _apply_zoom_effect(self, stream, start_scale, end_scale, duration):
        """Apply zoom effect using zoompan filter"""
        zoom_expr = f"'if(lte(zoom,{start_scale}),{start_scale},zoom+{(end_scale-start_scale)/(duration*self.fps)})'"
        return stream.filter(
            'zoompan',
            z=zoom_expr,
            d=duration * self.fps,
            s=f'{self.width}x{self.height}',
            fps=self.fps
        )

    def _apply_pan_effect(self, stream, direction, duration):
        """Apply pan effect"""
        pan_speed = 0.5  # pixels per frame
        if direction == 'left':
            x_expr = f"'iw-iw/zoom-{pan_speed}*on'"
        else:
            x_expr = f"'{pan_speed}*on'"

        return stream.filter(
            'zoompan',
            z='1.1',
            x=x_expr,
            y="'ih/2-(ih/zoom/2)'",
            d=duration * self.fps,
            s=f'{self.width}x{self.height}',
            fps=self.fps
        )

    def _apply_shake_effect(self, stream):
        """Apply shake effect using crop with random offsets"""
        return stream.filter(
            'crop',
            w=f'{self.width-20}',
            h=f'{self.height-20}',
            x="'10+random(1)*10'",
            y="'10+random(1)*10'"
        ).filter(
            'scale',
            w=self.width,
            h=self.height
        )

    def _concat_scenes(self, scene_clips, output_path, audio_config=None):
        """Concatenate scene clips into final video"""
        # Create concat list file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            for clip in scene_clips:
                f.write(f"file '{clip}'\n")
            concat_list = f.name

        try:
            # Build FFmpeg concat command
            input_stream = ffmpeg.input(concat_list, format='concat', safe=0)

            # Add audio if provided
            if audio_config and audio_config.get('file'):
                audio_path = self._get_media_path(audio_config['file'])
                audio_stream = ffmpeg.input(audio_path)

                volume = audio_config.get('volume', 1.0)
                audio_stream = audio_stream.filter('volume', volume=volume)

                output = ffmpeg.output(
                    input_stream,
                    audio_stream,
                    output_path,
                    vcodec='copy',
                    acodec='aac',
                    audio_bitrate='192k',
                    shortest=None
                )
            else:
                output = ffmpeg.output(
                    input_stream,
                    output_path,
                    vcodec='copy',
                    an=None  # No audio
                )

            output.overwrite_output().run(quiet=True)

        finally:
            os.unlink(concat_list)

    def process(self, scenes, output_path, audio_config=None):
        """
        Process all scenes into a final video

        Args:
            scenes: List of scene configurations
            output_path: Path for output video
            audio_config: Optional audio configuration
        """
        if not scenes:
            raise ValueError("No scenes to process")

        self._update_progress(0, "Starting video processing")

        # Create temp directory for intermediate files
        temp_dir = tempfile.mkdtemp(prefix='video_export_')

        try:
            scene_clips = []
            total_scenes = len(scenes)

            # Process each scene
            for i, scene in enumerate(scenes):
                progress = int((i / total_scenes) * 80)
                self._update_progress(progress, f"Processing scene {i + 1}/{total_scenes}")

                clip_path = self._create_scene_clip(scene, temp_dir, i)
                scene_clips.append(clip_path)

            # Concatenate all scenes
            self._update_progress(85, "Concatenating scenes")
            self._concat_scenes(scene_clips, output_path, audio_config)

            self._update_progress(100, "Export completed")

        finally:
            # Cleanup temp directory
            shutil.rmtree(temp_dir, ignore_errors=True)

        return output_path
