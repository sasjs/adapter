import { joinFolderPath } from './joinFolderPath'

describe('joinFolderPath', () => {
  it('joins a normal parent path', () => {
    expect(joinFolderPath('/Users/me', 'app')).toEqual('/Users/me/app')
  })

  it('does not double the slash when the parent is the root', () => {
    // adapter#974: '//app' reached ?path= and the server minted an id for a
    // folder that was not the one just created
    expect(joinFolderPath('/', 'app')).toEqual('/app')
  })

  it('collapses slashes a caller left on either side', () => {
    expect(joinFolderPath('/Users/me/', 'app')).toEqual('/Users/me/app')
    expect(joinFolderPath('//Users//me', 'app')).toEqual('/Users/me/app')
  })

  it('keeps a relative parent relative', () => {
    expect(joinFolderPath('myFolder', 'app')).toEqual('myFolder/app')
  })
})
