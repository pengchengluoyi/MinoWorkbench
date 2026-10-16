export async function copyToClipboard(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch {
    return copyWithSelection(text)
  }

  copyWithSelection(text)
}

function copyWithSelection(text: string): void {
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const activeInput = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement ? activeElement : null
  const inputSelection = activeInput && activeInput.selectionStart !== null
    ? { start: activeInput.selectionStart, end: activeInput.selectionEnd, direction: activeInput.selectionDirection }
    : null
  const selection = window.getSelection()
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : []
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.readOnly = true
  textarea.tabIndex = -1
  textarea.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;'
  const container = activeElement?.closest('[role="dialog"]') || document.body
  container.appendChild(textarea)

  try {
    textarea.focus({ preventScroll: true })
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    if (!document.execCommand('copy')) throw new Error('复制失败，请选中文本手动复制')
  } finally {
    textarea.remove()
    activeElement?.focus({ preventScroll: true })
    if (selection) {
      selection.removeAllRanges()
      ranges.forEach((range) => selection.addRange(range))
    }
    if (activeInput && inputSelection) {
      activeInput.setSelectionRange(inputSelection.start, inputSelection.end, inputSelection.direction)
    }
  }
}
