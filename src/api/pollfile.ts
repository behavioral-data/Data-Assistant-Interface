import { ContentsManager } from '@jupyterlab/services';
import { IComment } from './commentformat';
import { ISignal, Signal } from '@lumino/signaling';

export class FilePollManager {
  constructor(filePath: string) {
    this._filePath = filePath;
    this._contentManager = new ContentsManager();
  }

  async setLastModified(): Promise<void> {
    try {
        const model = await this._contentManager.get(this._filePath);
        console.log(`File ${this._filePath} exists!`);
        this._lastModified = model.last_modified;
      } catch (error) {
        console.log(`File ${this._filePath} does not exist or could not be accessed.`);
      }
    }

  async poll(): Promise<void> {
    console.log('Polling...' + this._lastModified)
    const model = await this._contentManager.get(this._filePath);
    
    if (model.last_modified !== this._lastModified) {
          // Notify the user that the file has changed
          console.log(`File ${this._filePath} has changed!`);
          const contents = JSON.parse(model.content) as Array<IComment>;
          const comments: IComment[] = contents.map((item) => {
            return item as IComment;
          });
          console.log(comments)
          this._lastModified = model.last_modified;
          // create a signal and emit the comments
          // connect the filewidget to this signal (the header probably) and pop a notification 
          this._fileChanged.emit(comments);

    }
    this._timerId = setTimeout(this.poll.bind(this), 5000);

    if (this._unloaded){
        clearTimeout(this._timerId);
    }
  }

  get fileChanged(): ISignal<this, IComment[]> {
    return this._fileChanged;
  }


  clearPoll(): void {
    console.log('cleared Poll')
    this._unloaded = true;
    if (this._timerId !== undefined){
        clearTimeout(this._timerId);
    }
    this._contentManager.dispose();
  }
  
  private _unloaded = false;
  private _timerId: NodeJS.Timeout | undefined = undefined;
  private _lastModified: string = '';
  private _filePath: string;
  private _contentManager: ContentsManager;
  private _fileChanged = new Signal <this, IComment[]>(this);

}