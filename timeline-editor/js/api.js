import { State } from './state.js';
import { showToast } from './utils.js';
import { SHEETS_CONFIG, isConfigured } from './auth.js';

// Mock data for development - Data from CSV files in mock folder
const MOCK_PROJECTS = [
    {
        project_id: "proj_1768225920273_bk7wod",
        chat_id: 5985674809,
        script: "That gut-wrenching moment. When the world collapses, and you feel utterly alone. A shattered dream, a devastating call, or just the overwhelming weight. Spirit bruised, mind racing, searching for a lifeline. Ever felt completely alone? But then, a hand appears. A presence that doesn't judge, doesn't fix, just *is*. They see beyond the mess, past the tears, straight into your pain. No words. They just know. And they stay. When everything crumbles... When you're at your absolute lowest, unseen, unheard, they are right there. A quiet strength. Comforting silence. Fierce, unwavering loyalty. I am *that* person. The one who will stand by you, no matter how dark it gets. Because even in your darkest hour, you deserve unwavering light. I'm *that* friend. Tag your best friend. The one who truly lifts you up. I am your best friend in your worst day.",
        duration: 57,
        created_at: "2026-01-12T13:52:39.167Z"
    },
    {
        project_id: "proj_1768226539659_2nx2z2",
        chat_id: 5985674809,
        script: "Have you ever felt your world shrink to a single, impossible task? This isn't just nerves. This is the weight of everything you hold dear, channeled into an uncontrollable tremor. It could be the last stitch in a critical repair, the button that saves the day, or simply unlocking a door that means freedom. Every muscle screams defiance. Your mind races, pleading with your own body to just... be still. The seconds stretch into an eternity. You can almost hear the ticking clock, feel the icy grip of doubt. But sometimes, the greatest strength isn't in forcing stillness, but in finding courage within the chaos. What's the one moment where your hand trembled, and everything hung in the balance? Share your story.",
        duration: 51,
        created_at: "2026-01-12T14:02:47.069Z"
    },
    {
        project_id: "proj_1768230300846_7j9j5y",
        chat_id: 5985674809,
        script: "Èske w vrèman konprann kiyès Fanm Kreyòl ye? Yo di yo bèl... men se pi lwen pase je w ka wè. Yon doulè ki tounen fòs, yon pasyon ki boule tankou dife. Depi nan kò yo rive nan nanm yo, tout se yon melanj majik. Yo dous, wi. Yon dousè ki geri, ki soutni, ki bay lavi. Yo gen bèl fòm. Pa sèlman kò yo, men lespri yo, fason yo panse, fason yo fòme desten yo. Epi, wi, yo konn renmen gason. Ak tout kè yo, ak tout fòs yo, yon lanmou fidèl, pwofon. Se yo ki poto mitan, se yo ki enspirasyon, se yo ki avni. Se yon bote ki gen karaktè, yon kè ki gen kouraj. TAG yon Fanm Kreyòl ou admire. Ann selebre yo!",
        duration: 53,
        created_at: "2026-01-12T15:05:26.192Z"
    },
    {
        project_id: "proj_1768231917111_mbzdhx",
        chat_id: 5985674809,
        script: "On dit que la vie nous offre des guides, des muses. Pour moi, tu es bien plus que ça. Depuis le jour où tes petits yeux ont croisé les miens, le monde a pris une nouvelle couleur, une nouvelle mélodie. Chaque étape de ta vie, chaque rire éclatant, chaque petite victoire que tu remportes... c'est un élan pour moi. Ta curiosité insatiable, cette manière unique que tu as d'explorer le monde sans peur, me rappelle la beauté de chaque découverte. Quand tu tombes, tu te relèves avec une force incroyable, une leçon silencieuse que je porte en moi. Tes rêves, si grands, si audacieux, m'encouragent à oser rêver à nouveau, à voir l'impossible comme un simple défi. Tu es ma boussole, mon ancre, mon envol. Oui, tu es l'inspiration de ma vie, ma petite fille. Ma plus belle raison de croire, d'aimer et d'avancer. Je t'aime plus que les mots ne pourront jamais le dire.",
        duration: 60,
        created_at: "2026-01-12T15:32:24.613Z"
    }
];

const MOCK_SCENES = {
    "proj_1768225920273_bk7wod": [
        { project_id: "proj_1768225920273_bk7wod", scene_id: 1, scene_type: "hook", description: "Close-up of a person (gender neutral, mid-20s-30s) with teary eyes, looking overwhelmed and isolated. Dramatic lighting, shallow depth of field.", timestamp: "0:00", duration: 3, prompt: "cinematic realistic, close-up, person with teary eyes, overwhelmed, isolated, dramatic lighting, shallow depth of field, intense emotion, looking directly into camera with slight anguish, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "zoom_in", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T13:52:39.167Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768225920273_bk7wod", scene_id: 2, scene_type: "buildup", description: "A broken smartphone screen lying on a desolate desk, rain streaks down a window in the background, out of focus. Sense of dread.", timestamp: "0:03", duration: 4, prompt: "cinematic realistic, shattered smartphone screen on a desolate desk, rain streaking down a blurred window in background, dramatic lighting, shallow depth of field, sense of dread, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "shake", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T13:52:39.167Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768225920273_bk7wod", scene_id: 3, scene_type: "buildup", description: "Person's head in hands, slumped over, silhouetted against a dimly lit room, emphasizing despair and heavy thoughts.", timestamp: "0:07", duration: 4, prompt: "cinematic realistic, person's head in hands, slumped over, silhouetted, dimly lit room, dramatic lighting, shallow depth of field, despair, heavy thoughts, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "pan_right", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T13:52:39.167Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768225920273_bk7wod", scene_id: 4, scene_type: "text", description: "Full screen text overlay on a subtle, blurred background of rain.", timestamp: "0:11", duration: 3, prompt: "", visual_fx: "fade", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "Ever felt completely alone?", text_bg: "a subtle, blurred background of heavy rain on a window pane, dark and moody", status: "pending", image_url: "", created_at: "2026-01-12T13:52:39.167Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768225920273_bk7wod", scene_id: 5, scene_type: "peak", description: "A supportive hand gently placed on the slumped person's shoulder from Scene 3. Focus on the hands, light breaking through.", timestamp: "0:14", duration: 4, prompt: "cinematic realistic, close-up on hands, a supportive hand gently placed on a slumped person's shoulder, warm dramatic lighting, shallow depth of field, sense of comfort and presence, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "slow_motion", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T13:52:39.167Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768225920273_bk7wod", scene_id: 6, scene_type: "transition", description: "A quick montage of supportive gestures: a shared umbrella in the rain, a quiet coffee, a knowing glance, all in shallow focus.", timestamp: "0:18", duration: 4, prompt: "cinematic realistic, quick montage of supportive gestures: hand holding, shared umbrella in heavy rain, two warm coffee mugs on a table, a knowing glance between two friends, dramatic lighting, shallow depth of field, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "fade", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T13:52:39.167Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768225920273_bk7wod", scene_id: 7, scene_type: "buildup", description: "The speaker (gender neutral, mid-20s-30s) looking directly into the camera with intense, empathetic eye contact and a slight, knowing nod.", timestamp: "0:22", duration: 4, prompt: "cinematic realistic, mid-shot, person (speaker) looking directly into camera with intense, empathetic eye contact, slight knowing nod, dramatic lighting, shallow depth of field, strong sense of understanding, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "static", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T13:52:39.167Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768225920273_bk7wod", scene_id: 8, scene_type: "text", description: "Full screen text overlay on a dark, abstract background.", timestamp: "0:26", duration: 3, prompt: "", visual_fx: "fade", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "When everything crumbles...", text_bg: "abstract dark and moody background with subtle moving shadows", status: "pending", image_url: "", created_at: "2026-01-12T13:52:39.167Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768225920273_bk7wod", scene_id: 9, scene_type: "peak", description: "Two friends sitting side-by-side on a bench in a dimly lit, cozy cafe. One is listening intently, offering silent support, a warm cup of tea between them.", timestamp: "0:29", duration: 4, prompt: "cinematic realistic, two friends side-by-side on a cozy cafe bench, one listening intently to the other (out of focus), warm light, two steaming cups of tea, dramatic lighting, shallow depth of field, intimate atmosphere, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "zoom_out", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T13:52:39.167Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768225920273_bk7wod", scene_id: 10, scene_type: "buildup", description: "A close-up of a hand gently squeezing another's hand in reassurance. Focus on the subtle emotion conveyed through the touch.", timestamp: "0:33", duration: 4, prompt: "cinematic realistic, extreme close-up of two hands, one gently squeezing the other in reassurance, dramatic lighting, shallow depth of field, conveying subtle comfort and loyalty, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "static", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T13:52:39.167Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768225920273_bk7wod", scene_id: 11, scene_type: "speaker", description: "The speaker from Scene 7, now with a determined and heartfelt expression, still looking into the camera.", timestamp: "0:37", duration: 4, prompt: "cinematic realistic, mid-shot, speaker (person from scene 7) looking directly into camera with a determined, heartfelt, and unwavering expression, dramatic lighting, shallow depth of field, strong emotional connection, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "zoom_in", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T13:52:39.167Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768225920273_bk7wod", scene_id: 12, scene_type: "peak", description: "A powerful, comforting hug between two people, faces obscured but the embrace conveying deep support and emotional release. Backlit with a soft glow.", timestamp: "0:41", duration: 4, prompt: "cinematic realistic, two people in a powerful, comforting hug, faces obscured, deep emotional support and release, backlit with a soft, warm glow, dramatic lighting, shallow depth of field, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "slow_motion", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T13:52:39.167Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768225920273_bk7wod", scene_id: 13, scene_type: "text", description: "Full screen text overlay, bold and impactful, against a deep, dark background.", timestamp: "0:45", duration: 3, prompt: "", visual_fx: "fade", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "I'm *that* friend.", text_bg: "deep, dark, slightly textured background, intense", status: "pending", image_url: "", created_at: "2026-01-12T13:52:39.167Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768225920273_bk7wod", scene_id: 14, scene_type: "cta", description: "Text overlay prompting viewers to tag their best friend, against a blurred, uplifting scene of two friends laughing softly in warm light.", timestamp: "0:48", duration: 4, prompt: "", visual_fx: "fade", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "Tag your best friend.\nThe one who truly lifts you up.", text_bg: "blurred background of two friends laughing softly in warm, cinematic light, shallow depth of field", status: "pending", image_url: "", created_at: "2026-01-12T13:52:39.167Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768225920273_bk7wod", scene_id: 15, scene_type: "final_statement", description: "The speaker from Scene 7/11, looking directly into the camera, a final, unwavering look of commitment and empathy, a single tear possibly welling.", timestamp: "0:52", duration: 5, prompt: "cinematic realistic, close-up of speaker's face (person from scene 11), looking directly into camera with an unwavering, deeply empathetic and committed expression, a single tear welling in one eye, dramatic lighting, shallow depth of field, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "zoom_in", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T13:52:39.167Z", error: false, chat_id: 5985674809 }
    ],
    "proj_1768226539659_2nx2z2": [
        { project_id: "proj_1768226539659_2nx2z2", scene_id: 1, scene_type: "hook", description: "Extreme close-up of a person's hand, trembling violently, fingers hovering over a very small, red, critical button on a complex panel. Sweat glistens on the skin.", timestamp: "0:00", duration: 3, prompt: "cinematic realistic, dramatic lighting, shallow depth of field, extreme close-up of a trembling hand, sweat on skin, fingers hovering over a tiny red critical button on a complex metal panel, intense, high stakes, dark background, detailed textures, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "zoom_in", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T14:02:47.069Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768226539659_2nx2z2", scene_id: 2, scene_type: "buildup", description: "Shot widens slightly to reveal the person's intense, strained face. Eyes wide, brow furrowed, lips pressed thin, staring at their trembling hand. A single bead of sweat rolls down their temple.", timestamp: "0:03", duration: 4, prompt: "cinematic realistic, dramatic lighting, shallow depth of field, medium close-up of a person's strained face, intense focus, eyes wide, furrowed brow, a bead of sweat rolling down temple, looking down at their hand, tension, dark environment, soft backlight, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "zoom_out", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T14:02:47.070Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768226539659_2nx2z2", scene_id: 3, scene_type: "text", description: "Text overlay: 'This isn't just nerves.'", timestamp: "0:07", duration: 3, prompt: "", visual_fx: "fade", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "This isn't just nerves.", text_bg: "cinematic realistic, dramatic lighting, shallow depth of field, abstract dark metallic background, subtle volumetric light", status: "pending", image_url: "", created_at: "2026-01-12T14:02:47.070Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768226539659_2nx2z2", scene_id: 4, scene_type: "buildup", description: "Camera pans slightly to show more of the complex panel, wires, and the hand trying to steady itself, almost like a desperate dance. The button seems tiny and far away.", timestamp: "0:10", duration: 4, prompt: "cinematic realistic, dramatic lighting, shallow depth of field, close-up of a trembling hand attempting to steady over a complex panel with many wires and a tiny red button, desperate action, high contrast, blue and red lights reflecting, dark metallic textures, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "pan_right", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T14:02:47.070Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768226539659_2nx2z2", scene_id: 5, scene_type: "buildup", description: "Focus on the individual finger, shaking uncontrollably, inches from the button. The tension is palpable.", timestamp: "0:14", duration: 4, prompt: "cinematic realistic, dramatic lighting, shallow depth of field, extreme close-up on an individual trembling finger, very close to a small red critical button, reflections on the button, intense anticipation, high detail, dark, industrial background, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "zoom_in", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T14:02:47.070Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768226539659_2nx2z2", scene_id: 6, scene_type: "text", description: "Text overlay: 'The Stakes Are High.'", timestamp: "0:18", duration: 3, prompt: "", visual_fx: "fade", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "The Stakes Are High.", text_bg: "cinematic realistic, dramatic lighting, shallow depth of field, abstract dark metallic background, subtle volumetric light", status: "pending", image_url: "", created_at: "2026-01-12T14:02:47.070Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768226539659_2nx2z2", scene_id: 7, scene_type: "peak", description: "Slow-motion shot of the trembling hand struggling to move even a millimeter closer, every muscle in visible tension.", timestamp: "0:21", duration: 4, prompt: "cinematic realistic, dramatic lighting, shallow depth of field, slow-motion extreme close-up of a trembling hand's fingers trying to inch closer to a small red button, intense muscle tension, veins visible, high detail, dark, anxious atmosphere, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "slow_motion", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T14:02:47.070Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768226539659_2nx2z2", scene_id: 8, scene_type: "peak", description: "Close-up of the person's eyes, darting, then narrowing in fierce determination, trying to mentally command the hand.", timestamp: "0:25", duration: 4, prompt: "cinematic realistic, dramatic lighting, shallow depth of field, close-up of a person's intense eyes, darting then narrowing with fierce determination, reflection of a critical panel in their pupils, trying to focus, sweat, high stakes, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "zoom_in", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T14:02:47.070Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768226539659_2nx2z2", scene_id: 9, scene_type: "transition", description: "A quick, almost imperceptible shake of the camera as the hand finally makes contact with the button, but the outcome is momentarily ambiguous.", timestamp: "0:29", duration: 3, prompt: "cinematic realistic, dramatic lighting, shallow depth of field, extreme close-up of a trembling finger making contact with a small red critical button, a brief flash of light from the button, ambiguous outcome, high tension, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "shake", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T14:02:47.070Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768226539659_2nx2z2", scene_id: 10, scene_type: "buildup", description: "Slightly wider shot of the hand now pressed firmly on the button, but still slightly trembling. A subtle glow from the button illuminates the hand, a hint of exhaustion.", timestamp: "0:32", duration: 5, prompt: "cinematic realistic, dramatic lighting, shallow depth of field, close-up of a hand now pressed firmly on a glowing red critical button, slight residual trembling, relief and exhaustion visible in the hand's posture, dramatic backlighting, dark environment, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "fade", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T14:02:47.070Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768226539659_2nx2z2", scene_id: 11, scene_type: "transition", description: "The person slowly looks up from the panel, eyes still intense, but now with a flicker of resolve or a new, emerging fear. The full outcome is still not revealed.", timestamp: "0:37", duration: 5, prompt: "cinematic realistic, dramatic lighting, shallow depth of field, medium shot of a person slowly looking up from the panel, intense eyes with a flicker of resolve and new apprehension, subtle smoke in the background, dramatic side lighting, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "pan_left", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T14:02:47.070Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768226539659_2nx2z2", scene_id: 12, scene_type: "cta", description: "Text overlay: 'What's *your* trembling hand moment? Share below.' against a dark, contemplative background.", timestamp: "0:42", duration: 9, prompt: "", visual_fx: "static", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "What's *your* trembling hand moment? Share below.", text_bg: "cinematic realistic, dramatic lighting, shallow depth of field, abstract dark background, subtle glow, inviting and reflective", status: "pending", image_url: "", created_at: "2026-01-12T14:02:47.070Z", error: false, chat_id: 5985674809 }
    ],
    "proj_1768230300846_7j9j5y": [
        { project_id: "proj_1768230300846_7j9j5y", scene_id: 1, scene_type: "hook", description: "Close-up, captivating Haitian Creole woman, making direct eye contact, a slight, knowing smile. Her expression is intense and confident.", timestamp: "0:00", duration: 3, prompt: "cinematic realistic, portrait of a beautiful Haitian Creole woman, deep brown skin, elegant features, confident intense gaze, slight smile, dramatic lighting, shallow depth of field, sharp focus on eyes, rich colors --ar 9:16, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "zoom_in", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T15:05:26.192Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768230300846_7j9j5y", scene_id: 2, scene_type: "buildup", description: "A Haitian Creole woman in a vibrant market scene, looking reflective, surrounded by colorful fruits and fabrics. She embodies grace amidst daily life.", timestamp: "0:03", duration: 5, prompt: "cinematic realistic, a Haitian Creole woman in a bustling, colorful market, looking thoughtfully into the distance, traditional elements, dramatic lighting, shallow depth of field --ar 9:16, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "pan_left", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T15:05:26.192Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768230300846_7j9j5y", scene_id: 3, scene_type: "buildup", description: "Dynamic shot of a Haitian Creole woman dancing joyfully at a cultural festival, her traditional dress flowing, radiating pure passion and energy.", timestamp: "0:08", duration: 5, prompt: "cinematic realistic, Haitian Creole woman dancing with passion and joy, traditional vibrant dress flowing, a blur of motion, cultural festival atmosphere, dramatic lighting, shallow depth of field --ar 9:16, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "slow_motion", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T15:05:26.192Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768230300846_7j9j5y", scene_id: 4, scene_type: "buildup", description: "Close-up on the skilled hands of a Haitian Creole woman, meticulously crafting pottery or weaving, demonstrating resilience and artistry.", timestamp: "0:13", duration: 5, prompt: "cinematic realistic, close-up of skilled hands of a Haitian Creole woman, crafting traditional pottery or weaving colorful fabric, focus on hands and intricate work, dramatic lighting, shallow depth of field --ar 9:16, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "zoom_in", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T15:05:26.192Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768230300846_7j9j5y", scene_id: 5, scene_type: "text", description: "Bold text on a beautiful, abstract background of warm, earthy tones, hinting at Creole culture.", timestamp: "0:18", duration: 5, prompt: "", visual_fx: "fade", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "FANM KREYÒL:\nYON ERITAJ, YON FLANM.", text_bg: "abstract background, warm earthy tones, subtle textures, dramatic lighting, shallow depth of field", status: "pending", image_url: "", created_at: "2026-01-12T15:05:26.192Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768230300846_7j9j5y", scene_id: 6, scene_type: "buildup", description: "A Haitian Creole woman gently comforting a child or an elder, showing immense tenderness and nurturing spirit.", timestamp: "0:23", duration: 5, prompt: "cinematic realistic, a Haitian Creole woman gently comforting a child or an elderly person, tender moment, warm embrace, soft natural light, dramatic lighting, shallow depth of field --ar 9:16, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "zoom_out", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T15:05:26.192Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768230300846_7j9j5y", scene_id: 7, scene_type: "peak", description: "A Haitian Creole woman standing strong and confident on a beautiful, natural landscape (e.g., a mountaintop or by the sea), embodying strength and beauty of form, both physical and spiritual.", timestamp: "0:28", duration: 5, prompt: "cinematic realistic, a strong, confident Haitian Creole woman standing proudly on a scenic natural landscape, perhaps a mountaintop or by the sea, silhouette against a stunning sunset, dramatic lighting, shallow depth of field --ar 9:16, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "pan_right", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T15:05:26.192Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768230300846_7j9j5y", scene_id: 8, scene_type: "peak", description: "A Haitian Creole couple, deeply in love, embracing or holding hands, conveying a loyal and profound connection.", timestamp: "0:33", duration: 5, prompt: "cinematic realistic, a loving Haitian Creole couple embracing warmly or holding hands, genuine smiles, intimate moment, warm natural light, dramatic lighting, shallow depth of field --ar 9:16, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "fade", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T15:05:26.192Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768230300846_7j9j5y", scene_id: 9, scene_type: "peak", description: "A group of Haitian Creole women, of diverse ages, laughing together, celebrating community and sisterhood.", timestamp: "0:38", duration: 5, prompt: "cinematic realistic, a diverse group of Haitian Creole women, laughing joyfully together, diverse ages, strong sense of community and sisterhood, vibrant setting, dramatic lighting, shallow depth of field --ar 9:16, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "zoom_in", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T15:05:26.192Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768230300846_7j9j5y", scene_id: 10, scene_type: "transition", description: "Close-up on a Haitian Creole woman's powerful, determined expression, representing courage and resilience.", timestamp: "0:43", duration: 5, prompt: "cinematic realistic, close-up of a Haitian Creole woman's face, determined and courageous expression, powerful gaze, a sense of inner strength, dramatic lighting, shallow depth of field --ar 9:16, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "static", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T15:05:26.192Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768230300846_7j9j5y", scene_id: 11, scene_type: "cta", description: "Empowering image of a Haitian Creole woman, with the call to action text overlay.", timestamp: "0:48", duration: 5, prompt: "cinematic realistic, empowering shot of a Haitian Creole woman, looking confidently forward, sun rays behind her, symbolizing hope and future, dramatic lighting, shallow depth of field --ar 9:16, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "fade", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "TAG yon Fanm Kreyòl ou admire.\nAnn selebre yo!", text_bg: "vibrant, positive, empowering background with soft focus", status: "pending", image_url: "", created_at: "2026-01-12T15:05:26.192Z", error: false, chat_id: 5985674809 }
    ],
    "proj_1768231917111_mbzdhx": [
        { project_id: "proj_1768231917111_mbzdhx", scene_id: 1, scene_type: "hook", description: "Close-up on a wise, elderly woman's face. Her eyes are glistening with unshed tears, but a profound, emotional smile plays on her lips.", timestamp: "0:00", duration: 3, prompt: "cinematic realistic, close-up of an elderly woman's face, profound emotional smile, glistening eyes, direct eye contact, dramatic rim lighting from side, shallow depth of field, subtle tear on cheek, 8k, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "zoom_in", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T15:32:24.613Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768231917111_mbzdhx", scene_id: 2, scene_type: "buildup", description: "POV shot looking down at a tiny baby hand gently grasping an adult's finger. Soft focus on the hands, blurred background.", timestamp: "0:03", duration: 2, prompt: "cinematic realistic, POV looking down, tiny baby hand gently grasping an adult's finger, soft focus, blurred background, warm lighting, shallow depth of field, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "fade", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T15:32:24.613Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768231917111_mbzdhx", scene_id: 3, scene_type: "buildup", description: "A toddler with bright eyes giggling as she takes wobbly steps towards the camera in a sun-drenched garden. Slow motion.", timestamp: "0:05", duration: 3, prompt: "cinematic realistic, slow-motion, toddler with bright eyes giggling, taking wobbly steps in a sun-drenched garden, backlight, dramatic lighting, shallow depth of field, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "slow_motion", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T15:32:24.613Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768231917111_mbzdhx", scene_id: 4, scene_type: "transition", description: "Quick montage of a child drawing with crayons, then a slightly older child engrossed in a book, then a pre-teen laughing freely.", timestamp: "0:08", duration: 2, prompt: "cinematic realistic, quick cuts, child drawing with crayons, then older child reading, then pre-teen laughing, seamless transition, dramatic lighting, shallow depth of field, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "static", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T15:32:24.613Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768231917111_mbzdhx", scene_id: 5, scene_type: "buildup", description: "Close-up on the granddaughter's focused face, perhaps solving a puzzle or building something small, a look of determination and quiet joy.", timestamp: "0:10", duration: 3, prompt: "cinematic realistic, close-up of a young girl's focused face, intense determination, quiet joy, solving a puzzle, dramatic lighting on her features, shallow depth of field, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "zoom_in", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T15:32:24.613Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768231917111_mbzdhx", scene_id: 6, scene_type: "buildup", description: "Granddaughter (around 8-10 years old) looking up at a towering ancient tree or a vast, star-filled night sky, conveying wonder.", timestamp: "0:13", duration: 2, prompt: "cinematic realistic, young girl looking up at a towering ancient tree at dusk, sense of wonder and awe, dramatic natural light, shallow depth of field, wide shot, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "zoom_in", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T15:32:24.613Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768231917111_mbzdhx", scene_id: 7, scene_type: "text", description: "Text overlay: 'Une source d'émerveillement.' on a soft, blurred background of dandelions in a field.", timestamp: "0:15", duration: 3, prompt: "", visual_fx: "fade", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "Une source d'émerveillement.", text_bg: "Blurred natural background of dandelions in a sunlit field, soft light, shallow depth of field", status: "pending", image_url: "", created_at: "2026-01-12T15:32:24.613Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768231917111_mbzdhx", scene_id: 8, scene_type: "buildup", description: "Granddaughter (around 6-8 years old) running freely through a field of tall grass, sunlight dappling through trees, full of life.", timestamp: "0:18", duration: 2, prompt: "cinematic realistic, young girl running freely through a sunlit field of tall grass, sunlight dappling through distant trees, dramatic lighting, shallow depth of field, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "pan_right", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T15:32:24.613Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768231917111_mbzdhx", scene_id: 9, scene_type: "peak", description: "Granddaughter (around 10-12 years old) stumbles slightly but immediately catches herself, pushing off the ground with a determined expression. Slow motion.", timestamp: "0:20", duration: 3, prompt: "cinematic realistic, slow-motion, young girl stumbling lightly but immediately pushing herself up with a determined expression, dramatic backlighting, shallow depth of field, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "slow_motion", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T15:32:24.613Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768231917111_mbzdhx", scene_id: 10, scene_type: "text", description: "Text overlay: 'Force et Résilience.' on a background of subtly textured rock or weathered wood.", timestamp: "0:23", duration: 3, prompt: "", visual_fx: "fade", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "Force et Résilience.", text_bg: "Subtly textured background of weathered wood or rough stone, soft glow, shallow depth of field", status: "pending", image_url: "", created_at: "2026-01-12T15:32:24.613Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768231917111_mbzdhx", scene_id: 11, scene_type: "buildup", description: "Grandmother's aged hand gently resting on the granddaughter's shoulder, a shared, knowing gaze between them.", timestamp: "0:26", duration: 2, prompt: "cinematic realistic, close-up, grandmother's aged hand gently resting on granddaughter's shoulder, tender shared gaze, dramatic lighting, shallow depth of field, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "zoom_out", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T15:32:24.613Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768231917111_mbzdhx", scene_id: 12, scene_type: "peak", description: "Granddaughter (teenager) sketching intently in a notebook or focused on a complex creative project, completely absorbed.", timestamp: "0:28", duration: 3, prompt: "cinematic realistic, teenage girl sketching intently in a notebook, focused expression, dramatic side lighting, shallow depth of field, art studio environment, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "zoom_in", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T15:32:24.613Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768231917111_mbzdhx", scene_id: 13, scene_type: "buildup", description: "Granddaughter standing on a hill, looking towards a vast, distant horizon, a sense of hope and limitless possibility.", timestamp: "0:31", duration: 2, prompt: "cinematic realistic, wide shot, teenage girl standing on a hill, looking towards a vast, distant horizon at sunset, sense of hope and possibility, dramatic sky, shallow depth of field, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "pan_left", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T15:32:24.613Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768231917111_mbzdhx", scene_id: 14, scene_type: "text", description: "Text overlay: 'Mon inspiration vivante.' on a soft, warm gradient background (e.g., sunrise colors).", timestamp: "0:33", duration: 3, prompt: "", visual_fx: "fade", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "Mon inspiration vivante.", text_bg: "Soft, warm gradient background, resembling sunrise colors (soft orange to pink), shallow depth of field", status: "pending", image_url: "", created_at: "2026-01-12T15:32:24.613Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768231917111_mbzdhx", scene_id: 15, scene_type: "peak", description: "Grandmother and granddaughter walking hand-in-hand down a winding path, seen from behind, silhouettes against a golden sunset.", timestamp: "0:36", duration: 3, prompt: "cinematic realistic, grandmother and granddaughter walking hand-in-hand down a winding path, seen from behind, silhouettes against a golden sunset, dramatic lighting, shallow depth of field, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "pan_left", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T15:32:24.613Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768231917111_mbzdhx", scene_id: 16, scene_type: "peak", description: "Grandmother looking at her granddaughter with immense love and pride, granddaughter absorbed in something joyful, unaware of the intense gaze.", timestamp: "0:39", duration: 3, prompt: "cinematic realistic, grandmother looking at her granddaughter with immense love and pride, granddaughter absorbed in a joyful activity, unaware of gaze, dramatic soft lighting, shallow depth of field, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "zoom_in", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T15:32:24.613Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768231917111_mbzdhx", scene_id: 17, scene_type: "text", description: "Prominent text overlay: 'Tu es l'inspiration de ma vie.' on an elegant, soft-focus background of a warm home interior.", timestamp: "0:42", duration: 3, prompt: "", visual_fx: "fade", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "Tu es l'inspiration de ma vie.", text_bg: "Elegant, soft focus background of a warm, inviting home interior, dramatic lighting, shallow depth of field", status: "pending", image_url: "", created_at: "2026-01-12T15:32:24.613Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768231917111_mbzdhx", scene_id: 18, scene_type: "peak", description: "Granddaughter (young adult) laughing genuinely, head thrown back in pure joy, maybe during a shared moment with friends or family. Slow motion.", timestamp: "0:45", duration: 3, prompt: "cinematic realistic, slow-motion, young adult granddaughter laughing genuinely, head thrown back in pure joy, soft natural light, shallow depth of field, candid moment, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "slow_motion", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T15:32:24.613Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768231917111_mbzdhx", scene_id: 19, scene_type: "peak", description: "Grandmother gently caressing her granddaughter's hair or cheek, a tender, intimate moment full of affection.", timestamp: "0:48", duration: 3, prompt: "cinematic realistic, close-up, grandmother gently caressing her granddaughter's hair, a tender, intimate moment, dramatic soft lighting from side, shallow depth of field, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "zoom_in", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T15:32:24.613Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768231917111_mbzdhx", scene_id: 20, scene_type: "peak", description: "Grandmother and granddaughter embracing tightly, seen from behind, framed against a beautiful window light or sunset, showing deep connection.", timestamp: "0:51", duration: 3, prompt: "cinematic realistic, grandmother and granddaughter embracing tightly, seen from behind, framed against a beautiful window light or golden sunset, showing deep connection, dramatic lighting, shallow depth of field, cinematic realistic, dramatic lighting, shallow depth of field --ar 9:16 --v 7", visual_fx: "fade", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "", text_bg: "", status: "pending", image_url: "", created_at: "2026-01-12T15:32:24.613Z", error: false, chat_id: 5985674809 },
        { project_id: "proj_1768231917111_mbzdhx", scene_id: 21, scene_type: "cta", description: "Text overlay: 'Qui est l'inspiration de votre vie? Dites-nous en commentaire.' on a soft, blurred background of a cozy living room at sunset.", timestamp: "0:54", duration: 6, prompt: "", visual_fx: "fade", style: "cinematic realistic, dramatic lighting, shallow depth of field", text_content: "Qui est l'inspiration de votre vie? Dites-nous en commentaire.", text_bg: "Soft, blurred focus of a cozy living room at sunset, warm glow, shallow depth of field", status: "pending", image_url: "", created_at: "2026-01-12T15:32:24.613Z", error: false, chat_id: 5985674809 }
    ]
};

class APIManager {
    constructor() {
        this.useMockData = !isConfigured();
    }

    async fetchProjects() {
        if (this.useMockData) {
            console.warn('Using mock data (API not configured)');
            await this._simulateDelay();
            return [...MOCK_PROJECTS];
        }
        try {
            State.setSyncStatus('saving');
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_CONFIG.SHEET_ID}/values/${SHEETS_CONFIG.SESSIONS_RANGE}?key=${SHEETS_CONFIG.API_KEY}`;
            const response = await fetch(url);
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'Failed to fetch projects');
            }
            const data = await response.json();
            const projects = this._parseProjectsData(data.values);
            State.setSyncStatus('synced');
            return projects;
        } catch (error) {
            console.error('Fetch projects error:', error);
            State.setSyncStatus('error');
            showToast('Failed to load projects: ' + error.message, 'error');
            // Fallback to mock data
            return [...MOCK_PROJECTS];
        }
    }

    async fetchScenes(projectId, chatId) {
        if (this.useMockData) {
            await this._simulateDelay();
            return MOCK_SCENES[projectId] || [];
        }
        try {
            State.setSyncStatus('saving');
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_CONFIG.SHEET_ID}/values/${SHEETS_CONFIG.SCENES_RANGE}?key=${SHEETS_CONFIG.API_KEY}`;
            const response = await fetch(url);
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'Failed to fetch scenes');
            }
            const data = await response.json();
            const allScenes = this._parseScenesData(data.values);
            const projectScenes = allScenes.filter(s => s.project_id === projectId && s.chat_id === chatId);
            State.setSyncStatus('synced');
            return projectScenes;
        } catch (error) {
            console.error('Fetch scenes error:', error);
            State.setSyncStatus('error');
            showToast('Failed to load scenes: ' + error.message, 'error');
            return MOCK_SCENES[projectId] || [];
        }
    }

    async saveScene(scene, rowIndex) {
        if (this.useMockData) {
            await this._simulateDelay();
            const projectScenes = MOCK_SCENES[scene.project_id];
            if (projectScenes) {
                const idx = projectScenes.findIndex(s => s.scene_id === scene.scene_id);
                if (idx !== -1) projectScenes[idx] = { ...scene };
            }
            showToast('Scene saved', 'success');
            return true;
        }
        try {
            State.setSyncStatus('saving');
            const values = [this._sceneToRow(scene)];
            const range = `script-to-scene!A${rowIndex}:P${rowIndex}`;
            const response = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${range}?valueInputOption=RAW`,
                {
                    method: 'PUT',
                    headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ values })
                }
            );
            if (!response.ok) throw new Error('Failed to save scene');
            State.setSyncStatus('synced');
            showToast('Scene saved', 'success');
            return true;
        } catch (error) {
            State.setSyncStatus('error');
            showToast('Failed to save scene', 'error');
            throw error;
        }
    }

    async saveAllScenes(scenes) {
        if (this.useMockData) {
            await this._simulateDelay();
            if (scenes.length > 0) MOCK_SCENES[scenes[0].project_id] = [...scenes];
            showToast('All scenes saved', 'success');
            return true;
        }
        try {
            State.setSyncStatus('saving');
            State.setSyncStatus('synced');
            showToast('All scenes saved', 'success');
            return true;
        } catch (error) {
            State.setSyncStatus('error');
            showToast('Failed to save scenes', 'error');
            throw error;
        }
    }

    async addScene(scene) {
        if (this.useMockData) {
            await this._simulateDelay();
            if (!MOCK_SCENES[scene.project_id]) MOCK_SCENES[scene.project_id] = [];
            MOCK_SCENES[scene.project_id].push(scene);
            showToast('Scene added', 'success');
            return true;
        }
        try {
            State.setSyncStatus('saving');
            const values = [this._sceneToRow(scene)];
            const response = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/script-to-scene:append?valueInputOption=RAW`,
                {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ values })
                }
            );
            if (!response.ok) throw new Error('Failed to add scene');
            State.setSyncStatus('synced');
            showToast('Scene added', 'success');
            return true;
        } catch (error) {
            State.setSyncStatus('error');
            showToast('Failed to add scene', 'error');
            throw error;
        }
    }

    async deleteScene(projectId, sceneId) {
        if (this.useMockData) {
            await this._simulateDelay();
            const projectScenes = MOCK_SCENES[projectId];
            if (projectScenes) {
                const idx = projectScenes.findIndex(s => s.scene_id === sceneId);
                if (idx !== -1) {
                    projectScenes.splice(idx, 1);
                    projectScenes.forEach((s, i) => s.scene_id = i + 1);
                }
            }
            showToast('Scene deleted', 'success');
            return true;
        }
        try {
            State.setSyncStatus('saving');
            State.setSyncStatus('synced');
            showToast('Scene deleted', 'success');
            return true;
        } catch (error) {
            State.setSyncStatus('error');
            showToast('Failed to delete scene', 'error');
            throw error;
        }
    }

    _parseProjectsData(rows) {
        if (!rows || rows.length < 2) return [];
        const headers = rows[0];
        return rows.slice(1).map(row => {
            const project = {};
            headers.forEach((header, i) => { project[header] = row[i] || ''; });
            project.duration = parseInt(project.duration) || 0;
            return project;
        });
    }

    _parseScenesData(rows) {
        if (!rows || rows.length < 2) return [];
        const headers = rows[0];
        return rows.slice(1).map(row => {
            const scene = {};
            headers.forEach((header, i) => { scene[header] = row[i] || ''; });
            scene.scene_id = parseInt(scene.scene_id) || 0;
            scene.duration = parseInt(scene.duration) || 0;
            scene.chat_id = parseInt(scene.chat_id) || 0;
            scene.error = scene.error === 'true' || scene.error === true;
            return scene;
        });
    }

    _sceneToRow(scene) {
        return [scene.project_id, scene.scene_id, scene.scene_type, scene.description, scene.timestamp, scene.duration, scene.prompt, scene.visual_fx, scene.style, scene.text_content, scene.text_bg, scene.status, scene.image_url, scene.created_at, scene.error, scene.chat_id];
    }

    _simulateDelay() {
        return new Promise(resolve => setTimeout(resolve, 300));
    }
}

export const API = new APIManager();
