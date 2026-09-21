const ui = document.createElement('div');
ui.style.cssText = `
  position: fixed; bottom: 20px; right: 20px; z-index: 999999;
  background: white; border: 1px solid #ccc; padding: 12px;
  border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  font-family: sans-serif; font-size: 14px; width: 280px; color: #000;
`;

ui.innerHTML = `
  <div style="font-weight: bold; margin-bottom: 8px;">Dr Pierre</div>
  <button id="df-solve-btn" style="width: 100%; padding: 8px; margin-bottom: 8px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Solve Question</button>
  <div id="df-status" style="margin-bottom: 8px; font-size: 14px; color: #333; white-space: pre-wrap; min-height: 24px; transition: color 0.2s;">Ready</div>
  <button id="df-enter-submit-btn" style="width: 100%; padding: 8px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; display: none; font-weight: bold;">Enter and Submit</button>
`;

document.body.appendChild(ui);

let currentAnswerLaTeX = "";
let isObservingIncorrect = false;

function renderMathInUI(latexString, prefix = "Answer: ") {
  let statusEl = document.getElementById('df-status');
  
  let displayText = latexString;
  const mcqMatch = latexString.match(/Option\s+(\d+)/i);
  if (mcqMatch) {
    const idx = parseInt(mcqMatch[1], 10) - 1;
    const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
    if (radios[idx]) {
      const labelText = (radios[idx].closest('label') || radios[idx].parentElement).textContent.replace(/\s+/g, ' ').trim();
      displayText = `Option ${idx + 1}: ${labelText}`;
    }
  }
  
  statusEl.style.cursor = 'pointer';
  statusEl.title = 'Click to copy answer';
  statusEl.innerText = prefix + displayText;
  
  const clone = statusEl.cloneNode(true);
  statusEl.parentNode.replaceChild(clone, statusEl);
  
  clone.addEventListener('click', () => {
    if (!latexString) return;
    navigator.clipboard.writeText(displayText).then(() => {
      clone.innerText = "Copied to clipboard!";
      clone.style.color = "#28a745";
      setTimeout(() => {
        clone.innerText = prefix + displayText;
        clone.style.color = "#333";
      }, 1500);
    }).catch(err => console.error("Clipboard copy failed:", err));
  });
}

function solveQuestion(isReattempt = false) {
  const statusEl = document.getElementById('df-status');
  statusEl.innerText = isReattempt ? 'Incorrect! Re-calculating...' : 'Reading question & thinking...';
  statusEl.style.cursor = 'default';

  // Ask the background script to extract the math/text in the MAIN world
  chrome.runtime.sendMessage({ action: 'extractQuestionText' }, (extResponse) => {
    if (chrome.runtime.lastError) {
      statusEl.innerText = chrome.runtime.lastError.message;
      return;
    }
    if (extResponse?.error) {
      statusEl.innerText = extResponse.error;
      return;
    }

    let questionText = extResponse.text || "";

    if (isReattempt && currentAnswerLaTeX) {
      questionText += `\n\n[System Note: A previous attempt of "${currentAnswerLaTeX}" was INCORRECT. Re-evaluate and provide a corrected answer.]`;
    }

    try {
      chrome.runtime.sendMessage({ action: 'solve', prompt: questionText }, (response) => {
        if (chrome.runtime.lastError) {
          statusEl.innerText = chrome.runtime.lastError.message;
          return;
        }
        if (response?.error) {
          statusEl.innerText = response.error;
          return;
        }

        const fullOutput = response.answer || '';
        const match = fullOutput.match(/<answer>([\s\S]*?)(?:<\/answer>|\\endanswer>|\\end{answer})/i);
        currentAnswerLaTeX = match ? match[1].trim() : fullOutput.trim();

        renderMathInUI(currentAnswerLaTeX, isReattempt ? "Re-solved: " : "Answer: ");
        document.getElementById('df-enter-submit-btn').style.display = 'block';
      });
    } catch (e) {
      if (e.message.includes('Extension context invalidated')) {
        statusEl.innerText = 'Extension updated! Please refresh the page (F5).';
      } else {
        statusEl.innerText = e.message;
      }
    }
  });
}

document.getElementById('df-solve-btn').addEventListener('click', () => {
  stopIncorrectMonitoring();
  solveQuestion(false);
});

document.getElementById('df-enter-submit-btn').addEventListener('click', () => {
  const statusEl = document.getElementById('df-status');
  statusEl.innerText = `Injecting...`;
  statusEl.style.cursor = 'default';

  const injected = injectIntoDrFrost(currentAnswerLaTeX);

  if (injected) {
    setTimeout(() => {
      if (clickSubmitButton()) {
        renderMathInUI(currentAnswerLaTeX, "Submitted: ");
        document.getElementById('df-enter-submit-btn').style.display = 'none';
        startIncorrectMonitoring();
      } else {
         statusEl.innerText = `Answer: ${currentAnswerLaTeX}\n\nInjected, but couldn't find 'Submit' button.`;
      }
    }, 500);
  } else {
    statusEl.innerText = `Failed to find input target.`;
  }
});

function startIncorrectMonitoring() {
  stopIncorrectMonitoring();
  isObservingIncorrect = true;

  let checkCount = 0;
  const interval = setInterval(() => {
    checkCount++;
    if (!isObservingIncorrect || checkCount > 30) { 
      clearInterval(interval);
      return;
    }

    const bodyText = document.body.innerText.toLowerCase();
    if (bodyText.includes('incorrect') || bodyText.includes("oops") || bodyText.includes("not right")) {
      clearInterval(interval);
      stopIncorrectMonitoring();
      solveQuestion(true);
    }
  }, 500);
}

function stopIncorrectMonitoring() {
  isObservingIncorrect = false;
}

function injectIntoDrFrost(answerText) {
  const mcqMatch = answerText.match(/Option\s+(\d+)/i);
  if (mcqMatch) {
    const idx = parseInt(mcqMatch[1], 10) - 1;
    const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
    if (radios[idx]) {
      const clickTarget = radios[idx].closest('label') || radios[idx].parentElement || radios[idx];
      clickTarget.click();
      radios[idx].checked = true;
      radios[idx].dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }

  const mqTextareas = Array.from(document.querySelectorAll('.mq-editable-field textarea, span.mq-textarea textarea'));
  const standardInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="submit"]):not([type="button"]), textarea:not(.mq-textarea), [contenteditable="true"]'))
                              .filter(el => el.getBoundingClientRect().width > 0);
  
  const targets = [...mqTextareas, ...standardInputs];

  if (targets.length > 0) {
    const targetInput = targets[targets.length - 1]; 
    targetInput.focus();
    
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    
    if (targetInput.tagName === 'INPUT' || targetInput.tagName === 'TEXTAREA') {
      targetInput.value = ''; 
    }

    document.execCommand('insertText', false, answerText);
    
    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: new DataTransfer(),
      bubbles: true,
      cancelable: true
    });
    pasteEvent.clipboardData.setData('text/plain', answerText);
    targetInput.dispatchEvent(pasteEvent);
    
    if (targetInput.tagName === 'INPUT' || targetInput.tagName === 'TEXTAREA') {
      let tracker = targetInput._valueTracker;
      targetInput.value = answerText;
      if (tracker) tracker.setValue('');
    } else if (!targetInput.classList.contains('mq-textarea')) {
      targetInput.innerText = answerText;
    }
    
    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
    targetInput.dispatchEvent(new Event('change', { bubbles: true }));
    
    return true;
  }
  return false;
}

function clickSubmitButton() {
  const elements = document.querySelectorAll('button, input[type="submit"], input[type="button"], a');
  for (const el of elements) {
    const text = (el.innerText || el.value || '').toLowerCase().trim();
    if (text === 'submit answer' || text === 'submit') {
      el.click();
      return true;
    }
  }
  return false;
}

// Watch for clicks on "Next question" buttons to reset the UI
document.addEventListener('click', (e) => {
  const clickTarget = e.target.closest('button, a, div[role="button"]');
  if (clickTarget) {
    const text = (clickTarget.innerText || clickTarget.value || '').toLowerCase().trim();
    if (text.includes('next question') || text === 'next') {
      currentAnswerLaTeX = "";
      stopIncorrectMonitoring();
      
      const statusEl = document.getElementById('df-status');
      if (statusEl) {
        const freshStatusEl = statusEl.cloneNode(false);
        freshStatusEl.innerText = "Ready";
        freshStatusEl.style.color = "#333";
        freshStatusEl.style.cursor = 'default';
        freshStatusEl.title = '';
        statusEl.parentNode.replaceChild(freshStatusEl, statusEl);
      }
      
      const submitBtn = document.getElementById('df-enter-submit-btn');
      if (submitBtn) {
        submitBtn.style.display = 'none';
      }
    }
  }
});
