import { chatCompletionStream, getModels } from './api'
import {
    parseHashParams,
    isScrolledToBottom,
    updateTextareaSize
} from './utils'
import { markdownToDocumentFragment } from './markdown'
import html2canvas from 'html2canvas'

const setupAPIKeyInput = () => {
    const apiKeyElements = document.querySelectorAll('.api-key-input')
    const savedAPIKey = localStorage.getItem('api-key') || ''
    console.log('savedapikey:', savedAPIKey)

    for (const apiKeyElement of apiKeyElements) {
        apiKeyElement.value = savedAPIKey

        apiKeyElement.addEventListener('input', () => {
            const key = apiKeyElement.value
            console.log('saving:', key)
            localStorage.setItem('api-key', key)
            for (const otherApiKeyElement of apiKeyElements) {
                otherApiKeyElement.value = key
            }
            updateApiKeyStatus()
        })
    }

    const introView = document.querySelector('#intro-view')
    if (!savedAPIKey) {
        introView.classList.remove('hidden')
    }

    document.querySelector('#intro-continue').addEventListener('click', () => {
        introView.classList.add('hidden')
        document.querySelector('#prompt').focus()
    })
}

const clearApiKeyStatus = () => {
    const statusElements = document.querySelectorAll('.api-key-status')
    statusElements.forEach(x => x.classList.remove('error'))
    statusElements.forEach(x => x.classList.remove('success'))
    statusElements.forEach(x => x.innerText = '')
}

const updateApiKeyStatus = () => {
    const statusElements = document.querySelectorAll('.api-key-status')
    const continueElement = document.querySelector('#intro-continue')

    clearApiKeyStatus()
    continueElement.classList.add('secondary')

    const apiKey = localStorage.getItem('api-key')
    if (!apiKey) {
        return
    }

    statusElements.forEach(x => x.innerText = 'Checking...')

    const models = getModels(apiKey)
    models.then(response => {
        if (response.error) {
            statusElements.forEach(x => x.classList.add('error'))
            if (response.error.code === 'invalid_api_key') {
                statusElements.forEach(x => x.innerText = 'This API key doesn’t work.')
            } else {
                statusElements.forEach(x => x.innerText = 'There was an error when checking the API key.')
            }
        } else {
            statusElements.forEach(x => x.innerText = 'This API key is working!')
            statusElements.forEach(x => x.classList.add('success'))
            continueElement.classList.remove('secondary')
        }
    }, error => {
        statusElements.forEach(x => x.innerText = 'There was an error when checking the API key.')
        statusElements.forEach(x => x.classList.add('error'))
    })
}

const setupSettingsHandlers = () => {
    const settingsView = document.querySelector('#settings-view')

    document.querySelector('#settings-button').addEventListener('click', () => {
        settingsView.classList.remove('hidden')
        clearApiKeyStatus()
    })

    document.querySelector('#settings-exit-button').addEventListener('click', () => {
        settingsView.classList.add('hidden')
        // document.querySelector('#prompt').focus() // annoying on mobile
    })

    document.querySelector('#settings-show-intro').addEventListener('click', () => {
        settingsView.classList.add('hidden')
        document.querySelector('#intro-view').classList.remove('hidden')
        updateApiKeyStatus()
    })
}


const getUserSelectedModel = () => {
    const modelSelect = document.querySelector('#model-select')
    return modelSelect.options[modelSelect.selectedIndex].value
}


const saveScreenshot = () => {

    // Get a reference to the element you want to save
    const elementToSave = document.querySelector('#output');

    // Use html2canvas to render the element as a canvas
    html2canvas(elementToSave).then(canvas => {
        // Convert the canvas to a downloadable data URL (image/png format)
        const dataURL = canvas.toDataURL('image/png')

        // Create a temporary anchor to download the image
        const tempAnchor = document.createElement('a')
        tempAnchor.href = dataURL
        tempAnchor.download = 'screenshot.png'

        // Append the anchor to the document, simulate a click and remove the anchor
        document.body.appendChild(tempAnchor)
        tempAnchor.click()
        document.body.removeChild(tempAnchor)
    })
}


let mouseDown = false
let hasSelectedText = false

document.addEventListener('mousedown', () => {
    mouseDown = true
    hasSelectedText = false
})

document.addEventListener('mousemove', () => {
    if (mouseDown && window.getSelection().toString().length > 0) {
        hasSelectedText = true
    }
})

document.addEventListener('mouseup', () => {
    mouseDown = false
})

let timeoutInterval = null
const showNotification = text => {
    let notification = document.querySelector('#notification')
    notification.className = 'notification show'
    notification.innerText = text
    if (timeoutInterval) {
        clearInterval(timeoutInterval)
    }
    timeoutInterval = setTimeout(() => {
        notification.className = "notification"
    }, 4000)
}

const injectCopyEventListeners = fragment => {
    for (const code of fragment.querySelectorAll('code, pre')) {
        code.addEventListener('click', event => {
            if (hasSelectedText) {
                return
            }
            event.stopPropagation()
            navigator.clipboard.writeText(code.innerText)
            .then(() => {
                showNotification('Copied!')
            })
            .catch((error) => {
                showNotification('Error copying text to clipboard:', error)
            })
        })
    }
}

const addMessage = (message, type) => {
    const element = document.querySelector('#output')

    const messageContainer = document.createElement('div')
    messageContainer.classList.add(`${type}-container`)
    element.appendChild(messageContainer)

    const messageBubble = document.createElement('div')
    messageBubble.classList.add(`${type}-bubble`)
    messageBubble.classList.add('message-bubble')
    const fragment = markdownToDocumentFragment(message)
    injectCopyEventListeners(fragment)
    messageBubble.appendChild(fragment)
    messageContainer.appendChild(messageBubble)

    const copiedIndicator = document.createElement('span')
    copiedIndicator.classList.add('copied-indicator')
    messageContainer.appendChild(copiedIndicator)

    return messageContainer
}

window.addEventListener('click', () => {
    const oldCopiedIndicators = document.querySelectorAll('.copied-indicator')
    for (const indicator of oldCopiedIndicators) {
        indicator.innerText = ''
    }
})

const addSentMessage = message => {
    return addMessage(message, 'my-message')
}

const addReceivedMessage = message => {
    return addMessage(message, 'response')
}

const addErrorMessage = (message, type) => {
    const element = document.querySelector('#output')

    const messageContainer = document.createElement('div')
    messageContainer.classList.add(`${type}-container`)
    messageContainer.classList.add('error')
    element.appendChild(messageContainer)

    messageContainer.innerText = message

    return messageContainer
}

const removeErrorMessages = () => {
    for (const errorMessage of document.querySelectorAll('.error')) {
        errorMessage.remove()
    }
}

window.addEventListener('load', () => {
    setupAPIKeyInput()
    setupSettingsHandlers()

    document.querySelector('#screenshot-button').addEventListener('click', () => {
        saveScreenshot()
    })

    let messages = [
        {
            'role': 'system',
            'content': 'Response format is ALWAYS markdown, especially for code.'
        }
    ]

    const sendMessage = (message) => {
        removeErrorMessages()
        addSentMessage(message)

        const typingIndicatorElement = addReceivedMessage('● ● ●')

        // scroll down always after sending message, even if wasn't before
        document.body.scrollIntoView({ block: 'end', behavior: 'smooth' })

        messages.push({
            'role': 'user',
            'content': message
        })

        const apiKey = localStorage.getItem('api-key')
        const model = getUserSelectedModel()

        let newMessage = {}
        let newMessageBubble = null

        chatCompletionStream(apiKey, {
            messages,
            model
        },
        (response) => {
            typingIndicatorElement.remove()
            const wasScrolledToBottom = isScrolledToBottom()

            if ('error' in response) {
                addErrorMessage(response.error.message, 'assistant')

            } else if ('choices' in response) {
                const delta = response.choices[0].delta
                if ('role' in delta) {
                    newMessage = {
                        'role': delta.role,
                        'content': ''
                    }
                    messages.push(newMessage)
                    newMessageBubble = addReceivedMessage(newMessage.content)
                }
                if ('content' in delta) {
                    newMessage.content += delta.content
                    newMessageBubble.firstChild.innerHTML = ''

                    const fragment = markdownToDocumentFragment(newMessage.content + '\n')
                    injectCopyEventListeners(fragment)
                    newMessageBubble.firstChild.appendChild(fragment)
                }
            }

            if (wasScrolledToBottom) {
                // Instant, non-smooth scroll
                window.scrollTo(0, document.body.scrollHeight)
            }
        })
    }

    const hashParams = parseHashParams()
    if ('q' in hashParams && hashParams.q) {
        sendMessage(hashParams.q)
    }

    const submitMessageForm = () => {
        const input = document.querySelector('#prompt').value
        document.querySelector('#prompt').value = ''
        updateTextareaSize(textbox)
        sendMessage(input)
    }


    const textbox = document.querySelector('#prompt')

    textbox.addEventListener('keydown', (event) => {
        // We need to use the deprecated event.keyCode here, because Chrome doesn't handle
        // Chinese pinyin keyboard correctly
        if (event.keyCode === 13 && !event.ctrlKey && !event.altKey && !event.shiftKey) {
            event.preventDefault()
            submitMessageForm()
        }
    })

    document.querySelector('form').addEventListener('submit', (event) => {
        event.preventDefault()
        submitMessageForm()
    })

    textbox.addEventListener('input', () => {
        updateTextareaSize(textbox)
    })
    updateTextareaSize(textbox)


    document.addEventListener('keydown', event => {
        if (event.ctrlKey && event.key.toLowerCase() === 'm') {
            rotateSelectValue('model-select')
        }
    })

    const rotateSelectValue = selectId => {
        const select = document.querySelector(`#${selectId}`)

        if (select.selectedIndex < select.options.length - 1) {
            select.selectedIndex++
        } else {
            select.selectedIndex = 0
        }
    }

})