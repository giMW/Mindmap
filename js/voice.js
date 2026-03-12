// Web Speech API wrapper for voice dictation

/**
 * Check if the Web Speech API is available.
 */
export function isSpeechSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Create a voice recognition controller.
 *
 * @param {Object} callbacks
 *   - onInterim(text): called with interim (partial) results
 *   - onFinal(text): called with the final recognized text
 *   - onStart(): recognition started
 *   - onEnd(): recognition ended
 *   - onError(err): error occurred
 * @returns {{ start(), stop(), isListening() }}
 */
export function createVoiceController(callbacks = {}) {
  if (!isSpeechSupported()) {
    return {
      start() {},
      stop() {},
      isListening() { return false; },
    };
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();

  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  let listening = false;

  recognition.onstart = () => {
    listening = true;
    if (callbacks.onStart) callbacks.onStart();
  };

  recognition.onend = () => {
    listening = false;
    if (callbacks.onEnd) callbacks.onEnd();
  };

  recognition.onerror = (event) => {
    listening = false;
    if (callbacks.onError) callbacks.onError(event.error);
    if (callbacks.onEnd) callbacks.onEnd();
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        finalTranscript += result[0].transcript;
      } else {
        interimTranscript += result[0].transcript;
      }
    }

    if (finalTranscript && callbacks.onFinal) {
      callbacks.onFinal(finalTranscript.trim());
    } else if (interimTranscript && callbacks.onInterim) {
      callbacks.onInterim(interimTranscript.trim());
    }
  };

  return {
    start() {
      if (!listening) {
        try {
          recognition.start();
        } catch (e) {
          // Already started
        }
      }
    },
    stop() {
      if (listening) {
        recognition.stop();
      }
    },
    isListening() {
      return listening;
    },
  };
}
