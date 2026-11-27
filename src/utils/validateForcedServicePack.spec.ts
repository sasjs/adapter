import { validateForcedServicePack } from './validateForcedServicePack'

describe('forced service pack validation', () => {
  it('accepts a 100-character service name', () => {
    expect(() =>
      validateForcedServicePack('/Public/app', {
        members: [{ type: 'service', name: 'x'.repeat(100), code: '' }]
      })
    ).not.toThrow()
  })

  it('rejects an overlong nested service name', () => {
    expect(() =>
      validateForcedServicePack('/Public/app', {
        members: [
          {
            type: 'folder',
            name: 'nested',
            members: [{ type: 'service', name: 'x'.repeat(101), code: '' }]
          }
        ]
      })
    ).toThrow(/service.*name/i)
  })
})
