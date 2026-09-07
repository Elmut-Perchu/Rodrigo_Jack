// core/systems_vs/vs_audio_system.js - VS Mode sound
import { System } from '../systems/system.js';
import { Audio } from '../components/audio_component.js';

// Adventure runs from the site root, VS from /views/.
const BASE_PATH = (typeof window !== 'undefined' && window.location.pathname.includes('/views/'))
    ? '../'
    : './';

/**
 * Sound for the arena, using the same samples and the same state-driven
 * triggering as Adventure mode (core/systems/audio_system.js).
 *
 * The Adventure AudioSystem is tied to cutscenes, level music rotation and
 * enemy chatter, none of which exist here, so this is a trimmed version that
 * keeps the part that matters: footsteps, jumps and swings that sound exactly
 * like the solo game.
 *
 * Volume split by who is acting: your own character is heard fully, other
 * fighters - networked players and bots alike - only through one-shot
 * actions. Looping idle/run tracks for three other fighters would just be
 * noise.
 */
export class VSAudio extends System {
    constructor(game) {
        super(game);
        this.game = game;
        this.audio = new Audio();
        this.remoteAudio = new Audio();
        this.lastStates = new Map(); // entity uuid -> last animation state

        this.registerSounds(this.audio);
        this.registerSounds(this.remoteAudio);

        // Other players are quieter than you are
        this.remoteAudio.setCategoryVolume('sfx', 0.45);

        this.clash = new MetallicClash();
    }

    registerSounds(audio) {
        // Movement - identical ids and volumes to Adventure mode
        audio.addSound('player_idle', `${BASE_PATH}assets/sounds/player/idle.wav`,
            { volume: 0.2, loop: true, category: 'sfx' });
        audio.addSound('player_run', `${BASE_PATH}assets/sounds/player/run.wav`,
            { volume: 0.9, loop: true, category: 'sfx' });
        audio.addSound('player_jump', `${BASE_PATH}assets/sounds/player/jump.wav`,
            { volume: 0.9, category: 'sfx', cooldown: 0.3 });

        // Actions
        audio.addSound('player_roulade', `${BASE_PATH}assets/sounds/player/roll.wav`,
            { volume: 0.8, category: 'sfx' });
        audio.addSound('player_attack1', `${BASE_PATH}assets/sounds/player/attack1.wav`,
            { volume: 0.8, category: 'sfx' });
        audio.addSound('player_attack2', `${BASE_PATH}assets/sounds/player/attack2.wav`,
            { volume: 0.8, category: 'sfx' });
        audio.addSound('player_attack3', `${BASE_PATH}assets/sounds/player/attack3.wav`,
            { volume: 0.8, category: 'sfx' });

        // The spirit gauge, spent. The project has no player-side magic
        // sample but the enemy one is exactly the right timbre for a wraith.
        audio.addSound('spectre_cast', `${BASE_PATH}assets/sounds/enemy/magic.wav`,
            { volume: 0.75, category: 'sfx', cooldown: 0.2 });

        // Damage
        audio.addSound('player_hurt', `${BASE_PATH}assets/sounds/player/hurt.wav`,
            { volume: 0.9, category: 'sfx' });
        audio.addSound('player_death', `${BASE_PATH}assets/sounds/player/death.wav`,
            { volume: 0.9, category: 'sfx' });
    }

    update(deltaTime) {
        this.audio.update(deltaTime);
        this.remoteAudio.update(deltaTime);

        const local = this.game.localPlayer;
        if (local) this.followAnimation(local, this.audio, true);

        // Networked opponents and bots alike: anyone who is not you is heard
        // through the quieter one-shot channel.
        this.game.fighterEntities().forEach(entity => {
            if (entity === local) return;
            this.followAnimation(entity, this.remoteAudio, false);
        });
    }

    /**
     * Plays a sound whenever the character's animation state changes, exactly
     * as Adventure's updatePlayerSounds does.
     */
    followAnimation(entity, audio, isLocal) {
        const animation = entity.getComponent('animation');
        if (!animation) return;

        const state = animation.currentState;
        const previous = this.lastStates.get(entity.uuid);
        if (state === previous) return;
        this.lastStates.set(entity.uuid, state);

        const MOVEMENT = ['idle', 'run', 'jump'];
        const ACTIONS = ['attack1', 'attack2', 'attack3', 'roulade'];

        if (MOVEMENT.includes(state)) {
            if (!isLocal) return; // Remote footsteps would pile up

            if (previous && MOVEMENT.includes(previous)) {
                audio.stopSound(`player_${previous}`);
            }
            audio.playSound(`player_${state}`);
            return;
        }

        // Leaving a looping movement state for an action: stop the loop first
        if (isLocal && previous && MOVEMENT.includes(previous)) {
            audio.stopSound(`player_${previous}`);
        }

        if (ACTIONS.includes(state)) {
            audio.playSound(`player_${state}`);
        } else if (state === 'hurt' || state === 'death') {
            audio.playSound(`player_${state}`);
        }
    }

    /** One-shot, used by the parry handler. */
    playHurt() {
        this.audio.playSound('player_hurt');
    }

    playClash() {
        this.clash.play();
    }

    /** A spirit being loosed. */
    playCast() {
        this.audio.playSound('spectre_cast');
    }

    /** Frees the looping tracks when a player leaves. */
    forgetEntity(entity) {
        this.lastStates.delete(entity.uuid);
    }
}

/**
 * A metallic "ting" for blade-on-blade contact.
 *
 * Synthesised rather than sampled: the project ships no metal impact sound,
 * and a struck-metal timbre is easy to build from a few inharmonic partials
 * over a fast decay - a sampled hit would have meant adding a binary asset.
 */
class MetallicClash {
    constructor() {
        this.ctx = null;
    }

    ensureContext() {
        if (!this.ctx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return null;
            this.ctx = new Ctx();
        }
        // Browsers start the context suspended until a user gesture
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    }

    play() {
        const ctx = this.ensureContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        const out = ctx.createGain();
        out.gain.value = 0.35;
        out.connect(ctx.destination);

        // Inharmonic partials are what make metal sound like metal rather
        // than a musical note.
        const partials = [2100, 3170, 4480, 5920];
        partials.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'square';
            osc.frequency.setValueAtTime(freq * (0.98 + Math.random() * 0.04), now);

            const peak = 0.5 / (i + 1);
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(peak, now + 0.004);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45 - i * 0.07);

            osc.connect(gain);
            gain.connect(out);
            osc.start(now);
            osc.stop(now + 0.5);
        });

        // Short bright transient: the initial "clink" of the impact
        const noise = ctx.createBufferSource();
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        }
        noise.buffer = buffer;

        const bandpass = ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = 3800;
        bandpass.Q.value = 0.8;

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.5, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

        noise.connect(bandpass);
        bandpass.connect(noiseGain);
        noiseGain.connect(out);
        noise.start(now);
    }
}
