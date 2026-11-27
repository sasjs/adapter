import { Logger, LogLevel } from '@sasjs/utils/logger'
import { ServerType } from '@sasjs/utils/types'
import SASjs from '../SASjs'
import { SASViyaApiClient } from '../SASViyaApiClient'
import { RequestClient } from '../request/RequestClient'

describe('forced Viya service pack redeploy', () => {
  beforeEach(() => {
    jest
      .spyOn(RequestClient.prototype, 'assertDeploymentTransport')
      .mockImplementation(() => {})
  })
  afterEach(() => jest.restoreAllMocks())
  it.each([
    '/files/files/..',
    '/files/files/%2e%2e',
    '/files/files/not-a-uuid',
    '/files/files/11111111-2222-3333-4444-555555555555?x=y'
  ])('rejects invalid member URI %s', async (uri) => {
    const rc = new (<jest.Mock<RequestClient>>RequestClient)()
    const client = new SASViyaApiClient(
      'https://test.com',
      '/Public/app',
      'context',
      rc
    )
    jest.spyOn(rc, 'get').mockResolvedValue({
      status: 200,
      result: {
        count: 1,
        items: [{ name: 'asset.bin', contentType: 'file', uri }]
      }
    } as any)
    const put = jest.spyOn(rc, 'put')
    const conflict = {
      response: {
        status: 409,
        data: {
          errorCode: 0,
          httpStatusCode: 409,
          message:
            'File with name "asset.bin" already exists in folder "cc4760b1-e3de-40d4-916c-950cb4e40128".'
        }
      }
    }
    await expect(
      client.replaceConflictingFile(
        'asset.bin',
        Buffer.from('a'),
        '/Public/app',
        '/folders/folders/cc4760b1-e3de-40d4-916c-950cb4e40128',
        'token',
        conflict
      )
    ).rejects.toBe(conflict)
    expect(put).not.toHaveBeenCalled()
    expect(rc.get).toHaveBeenCalledTimes(1)
  })

  it.each([
    undefined,
    '',
    '*',
    'W/"weak"',
    'bare',
    '"one", "two"',
    '"bad\nvalue"'
  ])('rejects unsafe ETag %s', async (etag) => {
    const rc = new (<jest.Mock<RequestClient>>RequestClient)()
    const client = new SASViyaApiClient(
      'https://test.com',
      '/Public/app',
      'context',
      rc
    )
    const get = jest.spyOn(rc, 'get')
    get
      .mockResolvedValueOnce({
        status: 200,
        result: {
          count: 1,
          items: [
            {
              name: 'asset.bin',
              contentType: 'file',
              uri: '/files/files/11111111-2222-3333-4444-555555555555'
            }
          ]
        }
      } as any)
      .mockResolvedValueOnce({
        status: 200,
        result: {
          id: '11111111-2222-3333-4444-555555555555',
          name: 'asset.bin',
          contentType: 'text/plain'
        },
        etag
      } as any)
    const put = jest.spyOn(rc, 'put')
    const conflict = {
      response: {
        status: 409,
        data: {
          errorCode: 0,
          httpStatusCode: 409,
          message:
            'File with name "asset.bin" already exists in folder "cc4760b1-e3de-40d4-916c-950cb4e40128".'
        }
      }
    }
    await expect(
      client.replaceConflictingFile(
        'asset.bin',
        Buffer.from('a'),
        '/Public/app',
        '/folders/folders/cc4760b1-e3de-40d4-916c-950cb4e40128',
        'token',
        conflict
      )
    ).rejects.toThrow()
    expect(put).not.toHaveBeenCalled()
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('rejects an unknown 409 before listing or replacing files', async () => {
    ;(process as any).logger = new Logger(LogLevel.Off)
    const rc = new (<jest.Mock<RequestClient>>RequestClient)()
    const client = new SASViyaApiClient(
      'https://test.com',
      '/Public/app',
      'context',
      rc
    )
    const conflict = {
      response: { status: 409, data: { message: 'quota conflict' } }
    }
    const get = jest
      .spyOn(rc, 'get')
      .mockResolvedValue({ result: { count: 0, items: [] } } as any)
    await expect(
      client.replaceConflictingFile(
        'asset.bin',
        Buffer.from('a'),
        '/Public/app',
        '/folders/folders/cc4760b1-e3de-40d4-916c-950cb4e40128',
        'token',
        conflict
      )
    ).rejects.toBe(conflict)
    expect(get).not.toHaveBeenCalled()
  })

  it('completes a forced redeploy of a root file found on a later page without resource parent fields', async () => {
    ;(process as any).logger = new Logger(LogLevel.Off)
    const rc = new (<jest.Mock<RequestClient>>RequestClient)()
    const sasjs = new SASjs({
      serverUrl: 'https://test.com',
      serverType: ServerType.SasViya
    })
    const client = new SASViyaApiClient(
      'https://test.com',
      '/Public/app',
      'context',
      rc
    )
    ;(sasjs as any).sasViyaApiClient = client
    jest
      .spyOn((sasjs as any).requestClient, 'forDeployment')
      .mockReturnValue(rc)
    const createFolder = jest
      .spyOn(SASViyaApiClient.prototype, 'createFolder')
      .mockResolvedValue({
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
      } as any)
    const createJob = jest
      .spyOn(SASViyaApiClient.prototype, 'createJobDefinition')
      .mockResolvedValue({} as any)
    const conflict = {
      message: 'conflict',
      config: {
        method: 'post',
        url: '/files/files?parentFolderUri=parent&typeDefName=file#rawUpload'
      },
      response: {
        status: 409,
        data: {
          errorCode: 0,
          httpStatusCode: 409,
          message:
            'File with name "asset.bin" already exists in folder "cc4760b1-e3de-40d4-916c-950cb4e40128".'
        }
      }
    }
    jest.spyOn(rc, 'post').mockImplementation((url: string) => {
      if (
        url.includes(
          'parentFolderUri=/folders/folders/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
        )
      )
        return Promise.resolve({ status: 201, result: {} } as any)
      return Promise.reject(conflict)
    })
    const get = jest.spyOn(rc, 'get').mockImplementation((url: string) => {
      if (url.includes('/types/types'))
        return Promise.resolve({ result: { items: [] } } as any)
      if (url.includes('@item'))
        return Promise.resolve({
          status: 200,
          result: { id: 'cc4760b1-e3de-40d4-916c-950cb4e40128' }
        } as any)
      if (url.includes('/members?')) {
        const page = new URL(url, 'https://test.com').searchParams.get('start')
        return Promise.resolve({
          status: 200,
          result:
            page === '0'
              ? {
                  count: 2,
                  items: [
                    {
                      name: 'other',
                      contentType: 'file',
                      uri: '/files/files/other'
                    }
                  ]
                }
              : {
                  count: 2,
                  items: [
                    {
                      name: 'asset.bin',
                      contentType: 'file',
                      uri: '/files/files/11111111-2222-3333-4444-555555555555'
                    }
                  ]
                }
        } as any)
      }
      if (url.endsWith('/files/files/11111111-2222-3333-4444-555555555555'))
        return Promise.resolve({
          status: 200,
          result: {
            id: '11111111-2222-3333-4444-555555555555',
            name: 'asset.bin',
            contentType: 'application/octet-stream'
          },
          etag: '"etag1"'
        } as any)
      throw new Error(`Unexpected GET ${url}`)
    })
    const put = jest
      .spyOn(rc, 'put')
      .mockResolvedValue({ result: { id: 'file1' }, status: 200 } as any)
    const bytes = Buffer.from([0, 255, 42])
    const progress: string[] = []
    await expect(
      sasjs.deployServicePack(
        {
          members: [
            { type: 'file', name: 'asset.bin', code: bytes },
            {
              type: 'folder',
              name: 'services',
              members: [
                {
                  type: 'file',
                  name: 'nested.bin',
                  code: Buffer.from('nested')
                },
                { type: 'service', name: 'job', code: 'data _null_;run;' }
              ]
            }
          ]
        },
        undefined,
        undefined,
        'token',
        true,
        (entry) => progress.push(entry.name)
      )
    ).resolves.toBeUndefined()
    expect(
      get.mock.calls.some(([url]) => String(url).includes('start=1'))
    ).toBe(true)
    expect(put).toHaveBeenCalledWith(
      'https://test.com/files/files/11111111-2222-3333-4444-555555555555/content',
      bytes,
      'token',
      expect.objectContaining({ 'If-Match': '"etag1"' })
    )
    expect(createFolder).toHaveBeenCalledWith(
      'services',
      '/Public/app',
      undefined,
      'token',
      true
    )
    expect(createJob).toHaveBeenCalledWith(
      'job',
      'data _null_;run;',
      '/Public/app/services',
      '/folders/folders/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      'token'
    )
    expect(progress).toEqual(['asset.bin', 'services', 'nested.bin', 'job'])
  })

  it.each([
    { label: 'non-forced conflict', force: false, status: 409, items: [] },
    { label: 'unrelated server error', force: true, status: 500, items: [] },
    {
      label: 'wrong member type',
      force: true,
      status: 409,
      items: [
        { name: 'asset.bin', contentType: 'folder', uri: '/folders/folders/x' }
      ]
    },
    {
      label: 'different case',
      force: true,
      status: 409,
      items: [{ name: 'ASSET.BIN', contentType: 'file', uri: '/files/files/x' }]
    },
    {
      label: 'unsafe URI',
      force: true,
      status: 409,
      items: [
        {
          name: 'asset.bin',
          contentType: 'file',
          uri: '//evil.example/files/files/x'
        }
      ]
    },
    {
      label: 'duplicate file matches',
      force: true,
      status: 409,
      items: [
        { name: 'asset.bin', contentType: 'file', uri: '/files/files/x' },
        { name: 'asset.bin', contentType: 'file', uri: '/files/files/y' }
      ]
    }
  ])('does not overwrite for $label', async ({ force, status, items }) => {
    ;(process as any).logger = new Logger(LogLevel.Off)
    const rc = new (<jest.Mock<RequestClient>>RequestClient)()
    const sasjs = new SASjs({
      serverUrl: 'https://test.com',
      serverType: ServerType.SasViya
    })
    ;(sasjs as any).sasViyaApiClient = new SASViyaApiClient(
      'https://test.com',
      '/Public/app',
      'context',
      rc
    )
    jest
      .spyOn((sasjs as any).requestClient, 'forDeployment')
      .mockReturnValue(rc)
    const error = {
      message: 'conflict',
      config: {
        method: 'post',
        url: '/files/files?parentFolderUri=parent&typeDefName=file#rawUpload'
      },
      response: {
        status,
        data: {
          errorCode: 0,
          httpStatusCode: 409,
          message:
            'File with name "asset.bin" already exists in folder "cc4760b1-e3de-40d4-916c-950cb4e40128".'
        }
      }
    }
    jest.spyOn(rc, 'post').mockRejectedValue(error as never)
    jest.spyOn(rc, 'get').mockImplementation((url: string) => {
      if (url.includes('/types/types'))
        return Promise.resolve({ result: { items: [] } } as any)
      if (url.includes('@item'))
        return Promise.resolve({
          status: 200,
          result: { id: 'cc4760b1-e3de-40d4-916c-950cb4e40128' }
        } as any)
      if (url.includes('/members?'))
        return Promise.resolve({
          status: 200,
          result: { count: items.length, items }
        } as any)
      throw new Error('unexpected GET')
    })
    const put = jest.spyOn(rc, 'put')
    await expect(
      sasjs.deployServicePack(
        {
          members: [{ type: 'file', name: 'asset.bin', code: Buffer.from('a') }]
        },
        undefined,
        undefined,
        'token',
        force
      )
    ).rejects.toBe(error)
    expect(put).not.toHaveBeenCalled()
  })
})
