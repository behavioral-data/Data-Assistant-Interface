import { IComment } from '../api';
import { CodeEditor } from '@jupyterlab/codeeditor';

export interface ICellComment extends IComment {
  type: 'cell';
  target: {
    cellID: string;
  };
}

export interface ICellSelectionComment extends IComment {
  type: 'cell-selection';
  target: {
    cellID: string;
    start: CodeEditor.IPosition;
    end: CodeEditor.IPosition;
  };
}
