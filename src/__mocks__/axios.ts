import { AxiosStatic } from 'axios'

const mockAxios = jest.createMockFromModule('axios') as AxiosStatic

mockAxios.create = jest.fn(() => mockAxios)

export default mockAxios
