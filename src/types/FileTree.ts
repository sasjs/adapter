export interface FileTree {
  members: [FolderMember, ServiceMember]
}

export enum MemberType {
  folder = 'folder',
  service = 'service'
}

export interface FolderMember {
  name: string
  type: MemberType.folder
  members: [FolderMember, ServiceMember]
}

export interface ServiceMember {
  name: string
  type: MemberType.service
  code: string
}

export const isFileTree = (arg: any): arg is FileTree =>
  arg &&
  arg.members &&
  Array.isArray(arg.members) &&
  arg.members.filter(
    (member: FolderMember | ServiceMember) =>
      !isFolderMember(member) && !isServiceMember(member)
  ).length === 0

const isFolderMember = (arg: any): arg is FolderMember =>
  arg &&
  typeof arg.name === 'string' &&
  arg.type === MemberType.folder &&
  arg.members &&
  Array.isArray(arg.members) &&
  arg.members.filter(
    (member: FolderMember | ServiceMember) =>
      !isFolderMember(member) && !isServiceMember(member)
  ).length === 0

const isServiceMember = (arg: any): arg is ServiceMember =>
  arg &&
  typeof arg.name === 'string' &&
  arg.type === MemberType.service &&
  arg.code &&
  typeof arg.code === 'string'
