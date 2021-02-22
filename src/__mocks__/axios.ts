import { AxiosStatic } from 'axios'

const mockAxios = jest.genMockFromModule('axios') as AxiosStatic

mockAxios.create = jest.fn(() => mockAxios)

export default mockAxios
