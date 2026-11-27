import { SASViyaApiClient } from '../SASViyaApiClient'
import { RequestClient } from '../request/RequestClient'

const folderId = 'cc4760b1-e3de-40d4-916c-950cb4e40128'
const fileId = '11111111-2222-3333-4444-555555555555'
const file = {
  name: 'asset.bin',
  contentType: 'file',
  uri: `/files/files/${fileId}`
}
const other = {
  name: 'other',
  contentType: 'file',
  uri: `/files/files/${fileId}`
}
const conflict = {
  response: {
    status: 409,
    data: {
      errorCode: 0,
      httpStatusCode: 409,
      message: `File with name "asset.bin" already exists in folder "${folderId}".`
    }
  }
}

const run = async (
  pages: any[],
  resource: { value: any } = {
    value: {
      status: 200,
      result: { id: fileId, name: 'asset.bin', contentType: 'text/plain' },
      etag: '"v1"'
    }
  }
) => {
  const rc = new RequestClient('https://test.com').forDeployment(
    'https://test.com'
  )
  jest.spyOn(rc, 'assertDeploymentTransport').mockImplementation(() => {})
  const get = jest.spyOn(rc, 'get')
  pages.forEach((page) => get.mockResolvedValueOnce(page))
  get.mockResolvedValue(resource.value)
  const put = jest.spyOn(rc, 'put').mockResolvedValue({ status: 200 } as any)
  const client = new SASViyaApiClient(
    'https://test.com',
    '/Public/app',
    'context',
    rc
  )
  const attempt = client.replaceConflictingFile(
    'asset.bin',
    'data',
    '/Public/app',
    `/folders/folders/${folderId}`,
    'token',
    conflict
  )
  return { attempt, get, put }
}

describe('conflicting file replacement safety', () => {
  it('replaces a matching file when an optional folder field agrees', async () => {
    const { attempt, put } = await run(
      [{ status: 200, result: { count: 1, items: [file] } }],
      {
        value: {
          status: 200,
          result: {
            id: fileId,
            name: 'asset.bin',
            parentFolderUri: `/folders/folders/${folderId}`
          },
          etag: '"fresh"'
        }
      }
    )
    await expect(attempt).resolves.toBeUndefined()
    expect(put).toHaveBeenCalledTimes(1)
  })
  it('does not interpret the associated parentUri as folder membership', async () => {
    const { attempt, put } = await run(
      [{ status: 200, result: { count: 1, items: [file] } }],
      {
        value: {
          status: 200,
          result: {
            id: fileId,
            name: 'asset.bin',
            parentUri: '/associated/object'
          },
          etag: '"v1"'
        }
      }
    )
    await expect(attempt).resolves.toBeUndefined()
    expect(put).toHaveBeenCalledTimes(1)
  })
  it('rejects a 400 folder lookup even if the body has the expected id', async () => {
    const rc = new RequestClient('https://test.com').forDeployment(
      'https://test.com'
    )
    jest.spyOn(rc, 'assertDeploymentTransport').mockImplementation(() => {})
    const get = jest.spyOn(rc, 'get').mockResolvedValue({
      status: 400,
      result: { id: folderId }
    } as any)
    const put = jest.spyOn(rc, 'put')
    const client = new SASViyaApiClient(
      'https://test.com',
      '/Public/app',
      'context',
      rc
    )
    await expect(
      client.replaceConflictingFile(
        'asset.bin',
        'data',
        '/Public/app',
        undefined,
        'token',
        conflict
      )
    ).rejects.toBe(conflict)
    expect(get).toHaveBeenCalledTimes(1)
    expect(put).not.toHaveBeenCalled()
  })
  it.each([
    { label: 'renamed file', id: fileId, name: 'renamed.bin' },
    {
      label: 'different id',
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      name: 'asset.bin'
    },
    { label: 'missing id', name: 'asset.bin' },
    { label: 'missing name', id: fileId },

    {
      label: 'different parentFolderUri',
      id: fileId,
      name: 'asset.bin',
      parentFolderUri: '/folders/folders/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    },
    {
      label: 'malformed parentFolderUri',
      id: fileId,
      name: 'asset.bin',
      parentFolderUri: null
    }
  ])('rejects $label in the fresh resource', async ({ label, ...resource }) => {
    const { attempt, put } = await run(
      [{ status: 200, result: { count: 1, items: [file] } }],
      { value: { status: 200, result: resource, etag: '"fresh"' } }
    )
    await expect(attempt).rejects.toBeDefined()
    expect(put).not.toHaveBeenCalled()
  })
  it.each([null, '', '/folders/folders/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'])(
    'rejects a listed member with an unverifiable parent %s',
    async (parentFolderUri) => {
      const { attempt, put } = await run([
        {
          status: 200,
          result: { count: 1, items: [{ ...file, parentFolderUri }] }
        }
      ])
      await expect(attempt).rejects.toBeDefined()
      expect(put).not.toHaveBeenCalled()
    }
  )
  it.each([
    undefined,
    {},
    { result: { count: 1, items: [file] } },
    { status: 199, result: { count: 1, items: [file] } },
    { status: 300, result: { count: 1, items: [file] } }
  ])('rejects invalid list response %#', async (page) => {
    const { attempt, put } = await run([page])
    await expect(attempt).rejects.toBeDefined()
    expect(put).not.toHaveBeenCalled()
  })
  it.each([
    undefined,
    {},
    { result: { contentType: 'text/plain' }, etag: '"v1"' },
    { status: 199, result: { contentType: 'text/plain' }, etag: '"v1"' },
    { status: 300, result: { contentType: 'text/plain' }, etag: '"v1"' }
  ])('rejects invalid resource response %#', async (resource) => {
    const { attempt, put } = await run(
      [{ status: 200, result: { count: 1, items: [file] } }],
      { value: resource }
    )
    await expect(attempt).rejects.toBeDefined()
    expect(put).not.toHaveBeenCalled()
  })
  it('accepts successful lookup statuses with matching identity', async () => {
    const { attempt, put } = await run(
      [
        {
          status: 201,
          result: {
            count: 1,
            items: [
              { ...file, parentFolderUri: `/folders/folders/${folderId}` }
            ]
          }
        }
      ],
      {
        value: {
          status: 206,
          result: {
            id: fileId,
            name: 'asset.bin',
            parentUri: `/folders/folders/${folderId}`,
            parentFolderUri: `/folders/folders/${folderId}`,
            contentType: 'text/plain'
          },
          etag: '"v1"'
        }
      }
    )
    await expect(attempt).resolves.toBeUndefined()
    expect(put).toHaveBeenCalledTimes(1)
  })
  it.each(['file', 'folder'])(
    'rejects an additional case-variant %s',
    async (contentType) => {
      const result = {
        count: 2,
        items: [file, { name: 'ASSET.BIN', contentType }]
      }
      const { attempt, put } = await run([{ status: 200, result }])
      await expect(attempt).rejects.toBe(conflict)
      expect(put).not.toHaveBeenCalled()
    }
  )
  it.each([
    {
      label: 'same page',
      pages: [
        {
          count: 2,
          items: [file, { name: 'asset.bin', contentType: 'folder' }]
        }
      ]
    },
    {
      label: 'later page',
      pages: [
        { count: 2, items: [file] },
        { count: 2, items: [{ name: 'asset.bin', contentType: 'folder' }] }
      ]
    },
    {
      label: 'earlier page',
      pages: [
        { count: 2, items: [{ name: 'asset.bin', contentType: 'folder' }] },
        { count: 2, items: [file] }
      ]
    },
    {
      label: 'missing type',
      pages: [{ count: 2, items: [file, { name: 'asset.bin' }] }]
    }
  ])('rejects same-name non-file member on $label', async ({ pages }) => {
    const { attempt, put } = await run(
      pages.map((result) => ({ status: 200, result }))
    )
    await expect(attempt).rejects.toBe(conflict)
    expect(put).not.toHaveBeenCalled()
  })
  it.each([
    {
      label: 'increasing count',
      pages: [
        { count: 2, items: [file] },
        { count: 3, items: [other, other] }
      ]
    },
    {
      label: 'decreasing count',
      pages: [
        { count: 3, items: [file] },
        { count: 2, items: [other] }
      ]
    },
    {
      label: 'items exceeding count',
      pages: [{ count: 1, items: [file, other] }]
    },
    { label: 'zero count with items', pages: [{ count: 0, items: [file] }] }
  ])('rejects $label', async ({ pages }) => {
    const { attempt, put } = await run(
      pages.map((result) => ({ status: 200, result }))
    )
    await expect(attempt).rejects.toBe(conflict)
    expect(put).not.toHaveBeenCalled()
  })
})
