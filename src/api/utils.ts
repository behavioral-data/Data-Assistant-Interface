import { Awareness } from 'y-protocols/awareness';
import { IIdentity } from './commentformat';
import { getAnonymousUserName } from '@jupyterlab/docprovider';
import { UserIcons } from './icons';
import { CodeEditor } from '@jupyterlab/codeeditor';

export const emptyIdentity: IIdentity = {
  id: 0,
  icon: 0,
  name: 'User',
  color: ''
};

let count = -1;
export function randomIdentity(): IIdentity {
  return {
    id: count--,
    name: getAnonymousUserName(),
    color: randomColor(),
    icon: Math.floor(Math.random() * UserIcons.length)
  };
}

export function robotIdentity(): IIdentity {
  return {
    id: 0,
    name: 'DataLume',
    color: '#dca927',
    icon: 0
  }
}

export function userIdentity(): IIdentity {
  return {
    id: 1,
    name: 'Anonymous Crane',
    color: '#f57c00',
    icon: 23
  }
}


export function randomColor(): string {
  const validColors = [
    '#eb5351',
    '#ea357a',
    '#f57c00',
    '#dca927',
    '#24be61',
    '#8ed97c',
    '#ff709b',
    '#d170ff',
    '#7b61ff',
    '#4176ff',
    '#70c3ff',
    '#a8b84a'
  ];
  return validColors[Math.floor(Math.random() * validColors.length)];
}

export function setIdentityName(awareness: Awareness, name: string): boolean {
  let localState = awareness.getLocalState();
  if (localState == null) {
    return false;
  }
  const oldUser = localState['user'];
  if (oldUser == null) {
    return false;
  }
  let newUser = {
    name: name,
    color: oldUser['color'],
    icon: oldUser['icon'] ?? Math.floor(Math.random() * UserIcons.length)
  };
  awareness.setLocalStateField('user', newUser);

  //Checking if the localState has been updated
  localState = awareness.getLocalState();
  if (localState == null) {
    return false;
  }
  if (localState['user']['name'] != name) {
    return false;
  }
  return true;
}

export function getIdentity(awareness: Awareness, random: boolean = false): IIdentity {
  const localState = awareness.getLocalState();
  if (localState == null) {
    return emptyIdentity;
  }

  const userInfo = localState['user'];
  if (
    userInfo != null &&
    'name' in userInfo &&
    'color' in userInfo &&
    'icon' in userInfo
  ) {
    return {
      id: awareness.clientID,
      name: userInfo['name'],
      color: userInfo['color'],
      icon: userInfo['icon']
    };
  }


  return random ? randomIdentity() : robotIdentity();
}

export function getCommentTimeStamp(): string {
  return new Date().toString();
}


export function renderCommentTimeString(timeString: string): string {
  const d = new Date(timeString)
  const time = d.toLocaleString('default', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    });
    const date = d.toLocaleString('default', {
      month: 'short',
      day: 'numeric'
    });
    return time + ' ' + date
}

//function that converts a line-column pairing to an index
export function lineToIndex(str: string, line: number, col: number): number {
  if (line == 0) {
    return col;
  } else {
    let arr = str.split('\n');
    return arr.slice(0, line).join('\n').length + col + 1;
  }
}

export function hashString(s: string): number {
  let hash = 0;
  if (s.length == 0) {
    return hash;
  }
  for (let i = 0; i < s.length; i++) {
    let char = s.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

export function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
}

export function truncateFromEnd(text: string, maxLength: number): string {
  return text.length > maxLength ? '...' + text.slice(text.length - maxLength) : text;
}

export function toCodeMirrorPosition(
  pos: CodeEditor.IPosition
): CodeMirror.Position {
  return {
    line: pos.line,
    ch: pos.column
  };
}

export function toCodeEditorPosition(
  pos: CodeMirror.Position
): CodeEditor.IPosition {
  return {
    line: pos.line,
    column: pos.ch
  };
}
