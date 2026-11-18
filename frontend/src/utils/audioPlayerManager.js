// Global single-active audio playback manager
class AudioPlayerManager {
  constructor() {
    this.currentPlayCallback = null;
    this.currentId = null;
  }

  play(id, pauseCallback) {
    if (this.currentId && this.currentId !== id && this.currentPlayCallback) {
      try {
        this.currentPlayCallback();
      } catch (e) {
        console.warn('Error pausing previous audio:', e);
      }
    }
    this.currentId = id;
    this.currentPlayCallback = pauseCallback;
  }

  stop(id) {
    if (this.currentId === id) {
      this.currentId = null;
      this.currentPlayCallback = null;
    }
  }

  stopAll() {
    if (this.currentPlayCallback) {
      try {
        this.currentPlayCallback();
      } catch (e) {
        console.warn('Error pausing audio:', e);
      }
    }
    this.currentId = null;
    this.currentPlayCallback = null;
  }
}

export const audioPlayerManager = new AudioPlayerManager();
export default audioPlayerManager;
