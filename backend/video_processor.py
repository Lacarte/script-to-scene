"""
Video Processor
FFmpeg-based video processing for scene assembly and effects
"""

import os
import subprocess
import tempfile
import shutil
from PIL import Image, ImageDraw, ImageFont

# Check if ffmpeg-python is available, fallback to subprocess
try:
    import ffmpeg
    USE_FFMPEG_PYTHON = True
except ImportError:
    USE_FFMPEG_PYTHON = False
    print("Warning: ffmpeg-python not found, using subprocess fallback")


class VideoProcessor:
    """Processes scenes into a final video using FFmpeg"""

    def __init__(self, export_data, progress_callback=None):
        """
        Initialize processor with export data from frontend

        Args:
            export_data: Complete export configuration from prepareExportData()
            progress_callback: Function(progress, message) for progress updates
        """
        self.export_data = export_data
        self.progress_callback = progress_callback or (lambda p, m: None)

        # Extract output settings
        output = export_data.get('output', {})
        resolution = output.get('resolution', {})
        self.width = resolution.get('width', 1080)
        self.height = resolution.get('height', 1920)
        self.fps = output.get('fps', 30)
        self.codec = output.get('codec', 'libx264')
        self.pixel_format = output.get('pixel_format', 'yuv420p')
        self.preset = output.get('preset', 'medium')
        self.crf = output.get('crf', 23)

        # Base path for media files (relative to backend folder)
        self.media_base_path = export_data.get('media_base_path', '')

        # Get the backend directory and project root
        self.backend_dir = os.path.dirname(os.path.abspath(__file__))
        self.project_root = os.path.dirname(self.backend_dir)
        self.timeline_editor_dir = os.path.join(self.project_root, 'timeline-editor')

    def _update_progress(self, progress, message):
        """Update progress callback"""
        self.progress_callback(progress, message)

    def _get_media_path(self, relative_path):
        """
        Resolve media path from working-assets folder

        Media files are in timeline-editor/working-assets/{project_id}/
        """
        if not relative_path:
            return None

        if os.path.isabs(relative_path):
            return relative_path

        # Try paths relative to timeline-editor folder
        paths_to_try = [
            os.path.join(self.timeline_editor_dir, relative_path),
            os.path.join(self.project_root, relative_path),
            relative_path
        ]

        for path in paths_to_try:
            if os.path.exists(path):
                return os.path.abspath(path)

        raise FileNotFoundError(f"Media file not found: {relative_path}")

    def _create_text_scene(self, scene, temp_dir, index):
        """
        Create a video clip for a text scene

        Renders text on background (image or solid color)
        """
        text_config = scene.get('text', {})
        duration = scene.get('duration', 3)

        # Create text image
        text_image_path = os.path.join(temp_dir, f"text_{index:03d}.png")
        self._render_text_image(text_config, text_image_path)

        # Convert to video
        output_path = os.path.join(temp_dir, f"scene_{index:03d}.mp4")

        if USE_FFMPEG_PYTHON:
            self._create_video_from_image_ffmpeg(text_image_path, output_path, duration)
        else:
            self._create_video_from_image_subprocess(text_image_path, output_path, duration)

        return output_path

    def _render_text_image(self, text_config, output_path):
        """
        Render text overlay on background image or solid color
        """
        content = text_config.get('content', '')
        text_color = text_config.get('color', 'white')
        color_hex = text_config.get('color_hex', '#ffffff')
        background = text_config.get('background', {})

        # Try to load background image
        bg_image = None
        bg_image_path = background.get('image_path')
        if bg_image_path:
            try:
                full_path = self._get_media_path(bg_image_path)
                bg_image = Image.open(full_path).convert('RGB')
                # Resize to target resolution
                bg_image = bg_image.resize((self.width, self.height), Image.Resampling.LANCZOS)
            except Exception as e:
                print(f"Could not load background image: {e}")
                bg_image = None

        # Create image with background
        if bg_image:
            img = bg_image
        else:
            # Fallback to solid color
            fallback_color = background.get('fallback_color', '#000000')
            img = Image.new('RGB', (self.width, self.height), fallback_color)

        draw = ImageDraw.Draw(img)

        # Load font
        font_size = text_config.get('font_size', 48)
        try:
            # Try system fonts
            font = ImageFont.truetype("arial.ttf", font_size)
        except:
            try:
                font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
            except:
                font = ImageFont.load_default()

        # Word wrap text
        padding = text_config.get('padding', 80)
        max_width = self.width - (padding * 2)
        lines = self._wrap_text(content, font, max_width, draw)

        # Calculate text position (centered)
        line_height = font_size * 1.3
        total_height = len(lines) * line_height
        y = (self.height - total_height) / 2

        # Draw text
        for line in lines:
            bbox = draw.textbbox((0, 0), line, font=font)
            text_width = bbox[2] - bbox[0]
            x = (self.width - text_width) / 2
            draw.text((x, y), line, fill=color_hex, font=font)
            y += line_height

        img.save(output_path, 'PNG')

    def _wrap_text(self, text, font, max_width, draw):
        """Wrap text to fit within max_width"""
        words = text.split()
        lines = []
        current_line = ""

        for word in words:
            test_line = f"{current_line} {word}".strip()
            bbox = draw.textbbox((0, 0), test_line, font=font)
            width = bbox[2] - bbox[0]

            if width <= max_width:
                current_line = test_line
            else:
                if current_line:
                    lines.append(current_line)
                current_line = word

        if current_line:
            lines.append(current_line)

        return lines

    def _create_scene_clip(self, scene, temp_dir, index):
        """Create a video clip for a single scene"""
        media = scene.get('media', {})
        media_type = media.get('type', 'image')
        scene_id = scene.get('id', index + 1)

        print(f"  [Scene {scene_id}] Media type: {media_type}")

        # Handle text scenes
        if media_type == 'text':
            print(f"  [Scene {scene_id}] Creating text scene...")
            return self._create_text_scene(scene, temp_dir, index)

        # Handle image scenes
        media_path = media.get('path')
        if not media_path:
            raise ValueError(f"Scene {scene_id} has no media path")

        print(f"  [Scene {scene_id}] Looking for media: {media_path}")

        try:
            full_media_path = self._get_media_path(media_path)
            print(f"  [Scene {scene_id}] Found media at: {full_media_path}")
        except FileNotFoundError as e:
            print(f"  [Scene {scene_id}] ERROR: {e}")
            raise

        duration = scene.get('duration', 3)
        effect = scene.get('effect', {})
        effect_type = effect.get('type', 'static')

        print(f"  [Scene {scene_id}] Duration: {duration}s, Effect: {effect_type}")

        output_path = os.path.join(temp_dir, f"scene_{index:03d}.mp4")

        if USE_FFMPEG_PYTHON:
            self._create_scene_ffmpeg(full_media_path, output_path, duration, effect)
        else:
            self._create_scene_subprocess(full_media_path, output_path, duration, effect)

        return output_path

    def _create_video_from_image_ffmpeg(self, image_path, output_path, duration):
        """Create video from static image using ffmpeg-python"""
        (
            ffmpeg
            .input(image_path, loop=1, t=duration)
            .filter('scale', w=self.width, h=self.height)
            .output(
                output_path,
                vcodec=self.codec,
                pix_fmt=self.pixel_format,
                r=self.fps,
                crf=self.crf,
                preset=self.preset
            )
            .overwrite_output()
            .run(quiet=True)
        )

    def _create_video_from_image_subprocess(self, image_path, output_path, duration):
        """Create video from static image using subprocess"""
        cmd = [
            'ffmpeg', '-y',
            '-loop', '1',
            '-i', image_path,
            '-t', str(duration),
            '-vf', f'scale={self.width}:{self.height}',
            '-c:v', self.codec,
            '-pix_fmt', self.pixel_format,
            '-r', str(self.fps),
            '-crf', str(self.crf),
            '-preset', self.preset,
            output_path
        ]
        subprocess.run(cmd, check=True, capture_output=True)

    def _create_scene_ffmpeg(self, media_path, output_path, duration, effect):
        """Create scene video with effects using ffmpeg-python"""
        effect_type = effect.get('type', 'static')

        print(f"    [FFmpeg] Creating {duration}s clip with effect: {effect_type}")

        # For static scenes or simple effects, use fast method
        if effect_type in ['static', 'fade']:
            self._create_simple_scene(media_path, output_path, duration, effect_type)
            return

        # For zoom/pan effects, use zoompan filter (slower but necessary)
        self._create_effect_scene(media_path, output_path, duration, effect)

    def _create_simple_scene(self, media_path, output_path, duration, effect_type):
        """Fast method for static/fade scenes without zoompan"""
        # Build filter string for scale and crop (cover fit)
        filters = [
            f"scale='if(gte(iw/ih,{self.width}/{self.height}),-2,{self.width})':'if(gte(iw/ih,{self.width}/{self.height}),{self.height},-2)'",
            f"crop={self.width}:{self.height}",
            f"fps={self.fps}"
        ]

        # Add fade effect if requested
        if effect_type == 'fade':
            fade_dur = 0.5
            filters.append(f"fade=t=in:st=0:d={fade_dur}")
            filters.append(f"fade=t=out:st={duration - fade_dur}:d={fade_dur}")

        vf = ','.join(filters)

        cmd = [
            'ffmpeg', '-y',
            '-loop', '1',
            '-i', media_path,
            '-t', str(duration),
            '-vf', vf,
            '-c:v', self.codec,
            '-pix_fmt', self.pixel_format,
            '-preset', 'fast',  # Use fast preset for speed
            '-crf', str(self.crf),
            output_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"    [FFmpeg] ERROR: {result.stderr[:500]}")
            raise RuntimeError(f"FFmpeg failed: {result.stderr[:200]}")

    def _create_effect_scene(self, media_path, output_path, duration, effect):
        """Create scene with zoom/pan effects using zoompan filter"""
        effect_type = effect.get('type', 'static')
        frames = int(duration * self.fps)

        # Build zoompan parameters based on effect
        if effect_type == 'zoom_in':
            start_scale = effect.get('start_scale', 1.0)
            end_scale = effect.get('end_scale', 1.2)
            # zoompan: z is zoom level, starts at start_scale, increases each frame
            z_expr = f"'min({start_scale}+on*{(end_scale-start_scale)/frames},{end_scale})'"
            x_expr = "'iw/2-(iw/zoom/2)'"
            y_expr = "'ih/2-(ih/zoom/2)'"
        elif effect_type == 'zoom_out':
            start_scale = effect.get('start_scale', 1.2)
            end_scale = effect.get('end_scale', 1.0)
            z_expr = f"'max({start_scale}-on*{(start_scale-end_scale)/frames},{end_scale})'"
            x_expr = "'iw/2-(iw/zoom/2)'"
            y_expr = "'ih/2-(ih/zoom/2)'"
        elif effect_type == 'pan_left':
            pan_amount = effect.get('pan_amount', 0.2)
            z_expr = "'1.1'"
            x_expr = f"'iw*{pan_amount}*(1-on/{frames})'"
            y_expr = "'(ih-oh)/2'"
        elif effect_type == 'pan_right':
            pan_amount = effect.get('pan_amount', 0.2)
            z_expr = "'1.1'"
            x_expr = f"'iw*{pan_amount}*on/{frames}'"
            y_expr = "'(ih-oh)/2'"
        else:
            # Fallback to simple scene
            self._create_simple_scene(media_path, output_path, duration, 'static')
            return

        # Build zoompan filter - use a lower fps for zoompan then convert
        zoompan_fps = 25  # Lower fps for faster processing
        zoompan_frames = int(duration * zoompan_fps)

        vf = f"zoompan=z={z_expr}:x={x_expr}:y={y_expr}:d={zoompan_frames}:s={self.width}x{self.height}:fps={zoompan_fps},fps={self.fps}"

        cmd = [
            'ffmpeg', '-y',
            '-i', media_path,
            '-vf', vf,
            '-t', str(duration),
            '-c:v', self.codec,
            '-pix_fmt', self.pixel_format,
            '-preset', 'fast',
            '-crf', str(self.crf),
            output_path
        ]

        print(f"    [FFmpeg] Running zoompan effect...")
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"    [FFmpeg] ERROR: {result.stderr[:500]}")
            raise RuntimeError(f"FFmpeg failed: {result.stderr[:200]}")

    def _create_scene_subprocess(self, media_path, output_path, duration, effect):
        """Create scene video with effects using subprocess (fallback)"""
        effect_type = effect.get('type', 'static')

        # Build filter chain
        vf_filters = [
            f"scale='if(gte(iw/ih,{self.width}/{self.height}),-2,{self.width})':'if(gte(iw/ih,{self.width}/{self.height}),{self.height},-2)'",
            f"crop={self.width}:{self.height}"
        ]

        # Add effect filters
        if effect_type == 'fade':
            fade_duration = effect.get('fade_duration', 0.5)
            vf_filters.append(f"fade=t=in:st=0:d={fade_duration}")
            vf_filters.append(f"fade=t=out:st={duration-fade_duration}:d={fade_duration}")

        vf = ','.join(vf_filters)

        cmd = [
            'ffmpeg', '-y',
            '-loop', '1',
            '-i', media_path,
            '-t', str(duration),
            '-vf', vf,
            '-c:v', self.codec,
            '-pix_fmt', self.pixel_format,
            '-r', str(self.fps),
            '-crf', str(self.crf),
            '-preset', self.preset,
            output_path
        ]
        subprocess.run(cmd, check=True, capture_output=True)

    def _concat_scenes(self, scene_clips, output_path):
        """Concatenate scene clips into final video"""
        # Create concat list file
        concat_list_path = os.path.join(os.path.dirname(scene_clips[0]), 'concat_list.txt')
        with open(concat_list_path, 'w') as f:
            for clip in scene_clips:
                # Use forward slashes for FFmpeg compatibility
                clip_path = clip.replace('\\', '/')
                f.write(f"file '{clip_path}'\n")

        audio_config = self.export_data.get('audio')

        if USE_FFMPEG_PYTHON:
            self._concat_ffmpeg(concat_list_path, output_path, audio_config)
        else:
            self._concat_subprocess(concat_list_path, output_path, audio_config)

    def _concat_ffmpeg(self, concat_list_path, output_path, audio_config):
        """Concatenate using ffmpeg-python"""
        video = ffmpeg.input(concat_list_path, format='concat', safe=0)

        if audio_config and audio_config.get('path'):
            try:
                audio_path = self._get_media_path(audio_config['path'])
                audio = ffmpeg.input(audio_path)

                # Apply volume
                volume = audio_config.get('volume', 1.0)
                audio = audio.filter('volume', volume=volume)

                # Trim audio if needed
                trimmed_duration = audio_config.get('trimmed_duration')
                if trimmed_duration:
                    audio = audio.filter('atrim', duration=trimmed_duration)

                # Apply fade out
                fade_out = audio_config.get('fade_out', 0.5)
                total_duration = self.export_data.get('timeline', {}).get('total_duration', 60)
                audio = audio.filter('afade', type='out', start_time=total_duration - fade_out, duration=fade_out)

                (
                    ffmpeg
                    .output(
                        video, audio,
                        output_path,
                        vcodec='copy',
                        acodec='aac',
                        audio_bitrate='192k',
                        shortest=None
                    )
                    .overwrite_output()
                    .run(quiet=True)
                )
            except FileNotFoundError as e:
                print(f"Audio file not found, exporting without audio: {e}")
                self._concat_video_only(video, output_path)
        else:
            self._concat_video_only(video, output_path)

    def _concat_video_only(self, video_stream, output_path):
        """Concatenate video only (no audio)"""
        (
            ffmpeg
            .output(video_stream, output_path, vcodec='copy', an=None)
            .overwrite_output()
            .run(quiet=True)
        )

    def _concat_subprocess(self, concat_list_path, output_path, audio_config):
        """Concatenate using subprocess (fallback)"""
        if audio_config and audio_config.get('path'):
            try:
                audio_path = self._get_media_path(audio_config['path'])
                volume = audio_config.get('volume', 1.0)

                cmd = [
                    'ffmpeg', '-y',
                    '-f', 'concat', '-safe', '0', '-i', concat_list_path,
                    '-i', audio_path,
                    '-filter:a', f'volume={volume}',
                    '-c:v', 'copy',
                    '-c:a', 'aac', '-b:a', '192k',
                    '-shortest',
                    output_path
                ]
            except FileNotFoundError:
                cmd = [
                    'ffmpeg', '-y',
                    '-f', 'concat', '-safe', '0', '-i', concat_list_path,
                    '-c:v', 'copy', '-an',
                    output_path
                ]
        else:
            cmd = [
                'ffmpeg', '-y',
                '-f', 'concat', '-safe', '0', '-i', concat_list_path,
                '-c:v', 'copy', '-an',
                output_path
            ]

        subprocess.run(cmd, check=True, capture_output=True)

    def process(self, output_path):
        """
        Process all scenes into a final video

        Args:
            output_path: Path for output video
        """
        scenes = self.export_data.get('scenes', [])
        if not scenes:
            raise ValueError("No scenes to process")

        print(f"[VideoProcessor] Starting export with {len(scenes)} scenes")
        print(f"[VideoProcessor] Output path: {output_path}")
        print(f"[VideoProcessor] Timeline editor dir: {self.timeline_editor_dir}")

        self._update_progress(0, "Starting video processing")

        # Create temp directory for intermediate files
        temp_dir = tempfile.mkdtemp(prefix='video_export_')
        print(f"[VideoProcessor] Temp directory: {temp_dir}")

        try:
            scene_clips = []
            total_scenes = len(scenes)

            # Process each scene
            for i, scene in enumerate(scenes):
                progress = int((i / total_scenes) * 80)
                scene_type = scene.get('media', {}).get('type', 'image')
                scene_id = scene.get('id', i + 1)
                print(f"[VideoProcessor] Processing scene {i + 1}/{total_scenes} (id={scene_id}, type={scene_type})")
                self._update_progress(progress, f"Processing scene {i + 1}/{total_scenes} ({scene_type})")

                try:
                    clip_path = self._create_scene_clip(scene, temp_dir, i)
                    scene_clips.append(clip_path)
                    print(f"[VideoProcessor] Scene {i + 1} completed: {clip_path}")
                except Exception as e:
                    print(f"[VideoProcessor] ERROR in scene {i + 1}: {e}")
                    raise

            # Concatenate all scenes with audio
            print(f"[VideoProcessor] Concatenating {len(scene_clips)} clips...")
            self._update_progress(85, "Concatenating scenes and adding audio")
            self._concat_scenes(scene_clips, output_path)

            print(f"[VideoProcessor] Export completed successfully!")
            self._update_progress(100, "Export completed")

        finally:
            # Cleanup temp directory
            print(f"[VideoProcessor] Cleaning up temp directory...")
            shutil.rmtree(temp_dir, ignore_errors=True)

        return output_path
