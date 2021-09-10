enum domIDs {
  styles = 'sasjsAdapterStyles',
  overlay = 'sasjsAdapterLoginPromptBG',
  dialog = 'sasjsAdapterLoginPrompt'
}
const cssPrefix = 'sasjs-adapter'

export const openLoginPrompt = (): Promise<boolean> => {
  return new Promise(async (resolve) => {
    const style = document.createElement('style')
    style.id = domIDs.styles
    style.innerText = cssContent

    const loginPromptBG = document.createElement('div')
    loginPromptBG.id = domIDs.overlay
    loginPromptBG.classList.add(`${cssPrefix}popUpBG`)

    const loginPrompt = document.createElement('div')
    loginPrompt.id = domIDs.dialog
    loginPrompt.classList.add(`${cssPrefix}popUp`)

    const title = document.createElement('h1')
    title.innerText = 'Session Expired!'
    loginPrompt.appendChild(title)

    const descHolder = document.createElement('div')
    const desc = document.createElement('span')
    desc.innerText = 'You need to relogin, click OK to login.'
    descHolder.appendChild(desc)
    loginPrompt.appendChild(descHolder)

    const buttonCancel = document.createElement('button')
    buttonCancel.classList.add('cancel')
    buttonCancel.innerText = 'Cancel'
    buttonCancel.onclick = () => {
      closeLoginPrompt()
      resolve(false)
    }
    loginPrompt.appendChild(buttonCancel)

    const buttonOk = document.createElement('button')
    buttonOk.classList.add('confirm')
    buttonOk.innerText = 'Ok'
    buttonOk.onclick = () => {
      closeLoginPrompt()
      resolve(true)
    }
    loginPrompt.appendChild(buttonOk)

    document.body.style.overflow = 'hidden'

    document.body.appendChild(style)
    document.body.appendChild(loginPromptBG)
    document.body.appendChild(loginPrompt)
  })
}
const closeLoginPrompt = () => {
  Object.values(domIDs).forEach((id) => {
    const elem = document.getElementById(id)
    elem?.parentNode?.removeChild(elem)
  })

  document.body.style.overflow = 'auto'
}

const cssContent = `
.${cssPrefix}popUpBG ,
.${cssPrefix}popUp {
  z-index: 10000;
}
.${cssPrefix}popUp {
  box-sizing: border-box;
  -webkit-box-sizing: border-box;
  -moz-box-sizing: border-box;
  display: block;
  position: fixed;
  top: 40%;
  left: 50%;
  padding: 0;
  font-size: 14px;
  font-family: 'PT Sans', sans-serif;
  color: #fff;
  border-style: none;
  z-index: 999;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.2);
  margin: 0;
  width: 100%;
  max-width: 300px;
  height: auto;
  max-height: 300px;
  transform: translate(-50%, -50%);
}
.${cssPrefix}popUp > h1 {
  box-sizing: border-box;
  -webkit-box-sizing: border-box;
  -moz-box-sizing: border-box;
  padding: 5px;
  min-height: 40px;
  font-size: 1.2em;
  font-weight: bold;
  text-align: center;
  color: #fff;
  background-color: transparent;
  border-style: none;
  border-width: 5px;
  border-color: black;
}
.${cssPrefix}popUp > div {
  width: 100%;
  height: calc(100% -108px);
  margin: 0;
  display: block;
  box-sizing: border-box;
  -webkit-box-sizing: border-box;
  -moz-box-sizing: border-box;
  padding: 5%;
  text-align: center;
  border-width: 1px;
  border-color: #ccc;
  border-style: none none solid none;
  overflow: auto;
}
.${cssPrefix}popUp > div > span {
  display: table-cell;
  box-sizing: border-box;
  -webkit-box-sizing: border-box;
  -moz-box-sizing: border-box;
  margin: 0;
  padding: 0;
  width: 300px;
  height: 108px;
  vertical-align: middle;
  border-style: none;
}
.${cssPrefix}popUp .cancel {
  float: left;
}
.${cssPrefix}popUp .confirm {
  float: right;
}
.${cssPrefix}popUp > button {
  box-sizing: border-box;
  -webkit-box-sizing: border-box;
  -moz-box-sizing: border-box;
  margin: 0;
  padding: 10px;
  width: 50%;
  border: 1px none #ccc;
  color: #fff;
  font-family: inherit;
  cursor: pointer;
  height: 50px;
  background: rgba(1, 1, 1, 0.2);
}
.${cssPrefix}popUp > button:hover {
  background: rgba(0, 0, 0, 0.2);
}
.${cssPrefix}popUpBG {
  display: block;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  opacity: 0.95;
  z-index: 50;
  background-image: radial-gradient(#0378cd, #012036);
}
`
