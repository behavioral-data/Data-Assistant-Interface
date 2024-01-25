import { Menu, Panel, Widget } from '@lumino/widgets';
import {IDisposable} from '@lumino/disposable';
import { UUID } from '@lumino/coreutils';
import { Message } from '@lumino/messaging';
import { CommentFileWidget, CommentWidget, logger, FrontEndSavedWidgetInfo} from './widget';
import { YDocument } from '@jupyterlab/shared-models';
import { ISignal, Signal } from '@lumino/signaling';
import { Awareness } from 'y-protocols/awareness';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import {
  ICommentPanel,
  ICommentRegistry,
  ICommentWidgetRegistry
} from './token';
import { ILabShell, JupyterFrontEnd} from '@jupyterlab/application';
import { PanelHeader } from './header';
import { Logging } from './logging';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { Context, DocumentRegistry } from '@jupyterlab/docregistry';
import { hashString, robotIdentity, userIdentity } from './utils';
import { CommentFileModel } from './model';
import { CommentsPanelIcon } from './icons';
import { NewCommentButton } from './button';
import { FilePollManager } from './pollfile';
import { IIdentity } from './commentformat';
import { Contents } from '@jupyterlab/services';
import { IStatusBar } from '@jupyterlab/statusbar';
import { nullTranslator} from '@jupyterlab/translation';
import { SavingStatusComment } from './savestatus';
import { WidgetTracker } from '@jupyterlab/apputils';
import { ToolbarButton} from '@jupyterlab/apputils';
import { IComment } from './commentformat';
import { truncate } from './utils';


export namespace CommentCommandIDs {
  export const addComment = 'jl-comments:add-comment';
  export const deleteComment = 'jl-comments:delete-comment';
  export const editComment = 'jl-comments:edit-comment';
  export const replyToComment = 'jl-comments:reply-to-comment';
  export const save = 'jl-comments:save';
  export const toggleComment = 'jl-comments:toggle-show-comment';
  export const editor_mode_comment_map = {
    [CommentCommandIDs.save] : "Save Comments",
    [CommentCommandIDs.deleteComment] : 'Delete Comment',
    [CommentCommandIDs.editComment] : 'Edit Comment',
    [CommentCommandIDs.replyToComment] : 'Reply to Comment',
    [CommentCommandIDs.toggleComment] : 'Toggle Comments',
  };
  export const user_mode_comment_map = {
    [CommentCommandIDs.save] : "Save Response",
    [CommentCommandIDs.deleteComment] : 'Delete Response',
    [CommentCommandIDs.editComment] : 'Edit Response',
    [CommentCommandIDs.replyToComment] : 'Give Feedback to Response',
    [CommentCommandIDs.toggleComment] : '',
  }
}

export type CommentTracker = WidgetTracker<CommentWidget<any>>;

export interface IIdentityChanged extends IIdentity {
  userMode: boolean;
}

export class CommentPanel extends Panel implements ICommentPanel {
  renderer: IRenderMimeRegistry;

  constructor(options: CommentPanel.IOptions) {
    super();

    this.id = `CommentPanel-${UUID.uuid4()}`;
    this.title.icon = CommentsPanelIcon;
    this.addClass('jc-CommentPanel');

    const {
      docManager,
      commentRegistry,
      commentWidgetRegistry,
      shell,
      renderer,
      statusBar
    } = options;
    this._statusBar = statusBar;
    this._commentRegistry = commentRegistry;
    this._commentWidgetRegistry = commentWidgetRegistry;
    this._commentMenu = new Menu({ commands: options.app.commands });
    this._commentTracker = options.commentTracker;
    this._commandsDisposables = [];
    this._docManager = docManager;
    this._app = options.app;
    this.userMode = false;

    const panelHeader: PanelHeader = new PanelHeader({
      shell,
      panel: this
    });

    this.addWidget(panelHeader as Widget);

    this._panelHeader = panelHeader;
    this._shell = shell;
    this.renderer = renderer;
    this._localIdentity = this.userMode ? userIdentity() : robotIdentity();
    this._saving = new SavingStatusComment({
      translator: nullTranslator
    });
    
    this._statusBar.registerStatusItem('@jupyterlab/commenting:comment-saver', {
      item: this._saving,
      align: 'middle',
      isActive: () => this._saving.model !== null && this._saving.model.status !== null,
      activeStateChanged: this._saving.model!.stateChanged
    });

    docManager.services.contents.fileChanged.connect(this._onFileChange, this); // We need to listen to file changes to update the comments file
  }

  private async _onFileChange(
    contents: Contents.IManager,
    change: Contents.IChangedArgs
  ): Promise<void> {
    const sourcePath = change?.oldValue?.path;
    const commentsPath =
      sourcePath != null ? this.getCommentPathFor(sourcePath) : undefined;

    switch (change.type) {
      case 'delete':
        if (await this.pathExists(commentsPath!)) {
          return contents.delete(commentsPath!);
        }
        break;
      case 'rename':
        const newPath = change.newValue!.path!;
        if (!(await this.pathExists(commentsPath!))) {
          return;
        }
        const newCommentsPath = this.getCommentPathFor(newPath);
        if (this.sourcePath === sourcePath) {
          this._sourcePath = newPath;
        }
        return void contents.rename(commentsPath!, newCommentsPath);
      case 'save':  // TODO: figure out when and why this is called
        console.log("SAVE inside onFileChange")
        if (this.sourcePath === change.newValue!.path!) {
          if (!this.isUserMode){
            console.log("Save inside onFileChange, file widget context saved and not user mode")
            return this._fileWidget!.context.save();
          }
        }
        break;
    }
  }

  private _clearCommands(): void {
    while (this._commandsDisposables.length > 0) {
      this._commandsDisposables.pop()!.dispose();
    }
  }

  async refreshComments(): Promise<void> {
    const fileWidget = this.fileWidget;
    if (fileWidget == null) {
      return;
    }
    if (this.commentsPath == null) {
      return;
    }

    if (this.isHidden){
      return;
    }

    if (this.isUserMode && this.notificationButton != undefined){
      this.notificationButton.hide();
    }

    const result = fileWidget.widgets.map((widget) => {
      if (widget instanceof CommentWidget) {
        return { "commentId": widget.commentID, "text": truncate(widget.comment.text, 40)};
      } else {
        return null;
      }
    }).filter(res => res !== null);

    console.log("refresh results ", result)

    const loginfo : Logging.IRefreshLog = {
      event: "refresh results",
      contextId: fileWidget.context.path,
      // @ts-ignore
      existingComments: result
    }

    logger.info(loginfo)
    const commentContext = await this.getContext(this.commentsPath);
    await commentContext.ready;

    fileWidget.setContext(commentContext);

    if (this.isUserMode){
      const numWidgets = fileWidget.numberNewWidgetsToRender();
      const sleepTime = Math.max(300 + Math.random() * 100, 700 * numWidgets + Math.random() * 1000)
      await fileWidget.showRefresh(sleepTime)
      fileWidget.switchToUserMode();
    }else{
      fileWidget.switchToRobotMode();
    }
  };


  refreshCommands(): void { // We need to refresh the commands when the user mode changes (we change the names of the commands under the key "label")
    const comment_map = this.isUserMode ? CommentCommandIDs.user_mode_comment_map : CommentCommandIDs.editor_mode_comment_map;
    this._clearCommands();
    
    this._commandsDisposables.push(
      this._app.commands.addCommand(CommentCommandIDs.replyToComment, {
        label: comment_map[CommentCommandIDs.replyToComment],
        execute: () => {
          const currentComment = this._commentTracker.currentWidget;
          if (currentComment != null) {
            currentComment.revealReply();
          }
        }
      })
    );
    
    if (!this.isUserMode){
      this._commandsDisposables.push(
        this._app.commands.addCommand(CommentCommandIDs.save, {
          label: comment_map[CommentCommandIDs.save],
          execute: () => {
            const fileWidget = this.fileWidget;
            if (fileWidget == null) {
              return;
            }
      
            void fileWidget.context.save();
          }
        })
      );
    
      this._commandsDisposables.push(
        this._app.commands.addCommand(CommentCommandIDs.deleteComment, {
          label: comment_map[CommentCommandIDs.deleteComment],
          execute: () => {
            const currentComment = this._commentTracker.currentWidget;
            if (currentComment != null) {
              currentComment.deleteActive();
            }
          }
        })
      );
    
      this._commandsDisposables.push(
        this._app.commands.addCommand(CommentCommandIDs.editComment, {
        label: comment_map[CommentCommandIDs.editComment],
          execute: () => {
            const currentComment = this._commentTracker.currentWidget;
            if (currentComment != null) {
              currentComment.openEditActive();
            }
          }
        })
      );
      this._commandsDisposables.push(
        this._app.commands.addCommand(CommentCommandIDs.toggleComment, {
          label: comment_map[CommentCommandIDs.toggleComment],
          execute: () => {
            const currentComment = this._commentTracker.currentWidget;
            if (currentComment != null) {
              currentComment.toggleShowUser();
            }
          }
        })
      );
    }
  }

  private _changeIdentity(identity: IIdentity): void {
    if (this.fileWidget != null){
      console.log('Inside change identity: setting load model to true')
      this._loadingModel = true;
      const { name, color, icon } = identity;
          this.model!.awareness.setLocalStateField('user', {
            name,
            color,
            icon
          })
      this.update();
      if (this.userMode){
        this.fileWidget.switchToUserMode();
      }else{
        this.fileWidget.switchToRobotMode();
      }
      
      console.log('Inside change identity: setting load model to false')
      this._loadingModel = false;
      this._identityChanged.emit({...identity, userMode: this.userMode});
    }
  }

  switchToUserMode(): void{
    this.button.close();
    this._localIdentity = userIdentity();
    this.userMode = true;
    this._changeIdentity(this._localIdentity);
    this.refreshCommands();
    this._noMark.emit(undefined);
  }

  switchToRobotMode(): void {
    this._localIdentity = robotIdentity();
    this.userMode = false;
    this._changeIdentity(this._localIdentity);
    this.refreshCommands();
    this._mark.emit(undefined);
   }

  showOnShell(): void {
    this._shell.add(this, 'right', { rank: 600 });
  }

  getCommentFileNameFor(sourcePath: string): string {
    // console.log('sourcepath: ' + sourcePath + hashString(sourcePath))
    return hashString(sourcePath).toString() + '.comment';
  }

  getCommentPathFor(sourcePath: string): string {
    return this.pathPrefix + this.getCommentFileNameFor(sourcePath);
  }

  onUpdateRequest(msg: Message): void {
    if (this._fileWidget == null) {
      return;
    }

    const awareness = this.awareness;
    if (awareness != null && awareness !== this.panelHeader.awareness) {
      this.panelHeader.awareness = awareness;
    }
  }

  pathExists(path: string): Promise<boolean> {
    const contents = this._docManager.services.contents;
    return contents
      .get(path, { content: false })
      .then(() => true)
      .catch(() => false);
  }

  async getContext(path: string): Promise<Context> {
    const docManager = this._docManager;
    const factory = docManager.registry.getModelFactory('comment-file');
    const preference = docManager.registry.getKernelPreference(
      path,
      'comment-factory'
    );

    const context: Context =
      // @ts-ignore
      docManager._findContext(path, 'comment-file') ??
      // @ts-ignore
      docManager._createContext(path, factory, preference);
    // @ts-ignore
    await docManager.services.ready;
    const exists = await this.pathExists(path);
    await context.initialize(!exists);
    return context;
  }

  async loadModel(
    context: DocumentRegistry.IContext<DocumentRegistry.IModel>
  ): Promise<void> {
    // Lock to prevent multiple loads at the same time.
    
    if (this._loadingModel) {
      console.log("already loading model")
      return;
    }
    
    function isIPythonNotebook(filePath: string): boolean {
      return filePath.endsWith('.ipynb');
    }

    const sourcePath = context.path;
    // Attempting to load model for a non-document widget
    if (
      sourcePath === '' ||
      (this._sourcePath && this._sourcePath === sourcePath)
    ) {
      return;
    }

    if (!isIPythonNotebook(sourcePath)){
      return;
    }

    console.log("======== LOADING MODEL " + sourcePath + " ==========")

    this._sourcePath = sourcePath;
    console.log('Inside loadModel: setting load model to true')

    this._loadingModel = true;

    if (this._fileWidget != null) { // dispose of old things
      this.model!.changed.disconnect(this._onChange, this);
      const oldWidget = this._fileWidget;
      oldWidget.hide();
      oldWidget.clearWidgets();
      this._assistantButtonStates.set(oldWidget.context.path, oldWidget.assistantMode)
      this._savedCommentsInfo.set(oldWidget.context.path, oldWidget.savedCommentInfo)
      if (!oldWidget.context.isDisposed) {
        console.log('Saving old widget ' + oldWidget.context.path)
        // @ts-ignore
        console.log("Saving " + oldWidget.context.path + ' conmments: ', oldWidget.context.model.comments.toJSON())
        // console.log('Calling await oldWidget.context.save()')
        // await oldWidget.context.save(); //TODO this is kind of fked, figure out the bug here (some comments just  get deleted completedly and this is difficult to reproduce)
        console.log('Done saving old widget ' + oldWidget.context.path)
        oldWidget.dispose();
      }
    }

    if (this._filePollManager != null) {
      this._filePollManager.clearPoll();
    }

    this._commentsPath = this.getCommentPathFor(sourcePath);
    // console.log(sourcePath + " is mapped to" + this._commentsPath )
    console.log("Notebook path: " + sourcePath + "\nComment path: " + this._commentsPath)
    const commentContext = await this.getContext(this._commentsPath);
    await commentContext.ready;
    // @ts-ignore
    console.log("Just after getContext: ", commentContext.model.comments.toJSON())

    this._filePollManager = new FilePollManager(this._commentsPath);
    this._notificationButton = this._notificationButtons.get(this._sourcePath)
    await this._filePollManager.setLastModified();
    if (this._notificationButton != undefined && this.isUserMode) {
      this._filePollManager.fileChanged.connect(async (filePollManager: FilePollManager, comments: IComment[]) => {
            console.log('file changed in signal handler')
            console.log(comments)
            const notificationButton = this._notificationButton;
            const hasNewComments = this.fileWidget?.newComments(comments)
            if (hasNewComments === true && notificationButton != undefined && this.isHidden && this.fileWidget?.assistantMode) {
              console.log('new comments')
              notificationButton.show();
            }
            console.log('calling refresh new comments')
            if (this.isUserMode){
              this._handlingPollingChanges = true;
              // commentsPath should not be null
              this.fileWidget?.saveWigetsInfo();
              // @ts-ignore
              const commentContext = await this.getContext(this.commentsPath);
              await commentContext.ready;
              // @ts-ignore
              console.log( "Inside refresh new comments: ", commentContext.model.comments.toJSON())
              this.fileWidget?.setContext(commentContext);
              if (this.fileWidget?.assistantMode === true){
                if (this.fileWidget?.numberUnseenWidgetsToRender() > 0){
                  await this.fileWidget?.showRefresh(1000 + Math.random() * 1000);
                  this.fileWidget?.initialize();
                }
              } else {
                this.fileWidget?.clearWidgets();
                this.fileWidget?.insertEmpty();
              }
              this._handlingPollingChanges = false;
            }
            
          }
      )
    }   


    this._filePollManager.poll();

    const widgetAssistantMode = this._assistantButtonStates.get(this.commentsPath!) ?? false;
    const widgetSavedCommentInfo = this._savedCommentsInfo.get(this.commentsPath!) ?? new Map<string, FrontEndSavedWidgetInfo>();
    const content = new CommentFileWidget(
      { 
        context: commentContext, 
        userMode: this.userMode, 
        assistantMode: widgetAssistantMode, 
        savedCommentInfo: widgetSavedCommentInfo
      },
      this.renderer
    );
    // @ts-ignore
    console.log( "Loaded comments: " + commentContext.path, content.context.model.comments.toJSON())
    console.log('Finished creating filewidget for ' + this.sourcePath)
    this._fileWidget = content;
    this.addWidget(content);

    this._saving.model.widget = content;
    content.commentAdded.connect((_, widget) =>
      this._commentAdded.emit(widget)
    );

    this.model!.changed.connect(this._onChange, this);

    const { name, color, icon } = this._localIdentity;
    this.model!.awareness.setLocalStateField('user', {
      name,
      color,
      icon
    });

    this.update();
    content.initialize();
    // content.insertWidget(0, new EmptyWidget(true));
    this._modelChanged.emit(content);
    console.log('Inside loadModel: setting load model to false')
    this._loadingModel = false;
  }

  private _onChange(
    _: CommentFileModel,
    changes: CommentFileModel.IChange[]
  ): void {
    const fileWidget = this.fileWidget;
    if (fileWidget == null) {
      return;
    }

    if (this._handlingPollingChanges){
      return;
    }

    const widgets = fileWidget.widgets;
    let index = 0;

    for (let change of changes) {
      if (change.retain != null) {
        index += change.retain;
      } else if (change.insert != null) {
        change.insert.forEach(comment =>
          fileWidget.insertComment(comment, index++)
        );
      } else if (change.delete != null) {
        widgets
          .slice(index, index + change.delete)
          .forEach(widget => widget.dispose());
      } else if (change.update != null) {
        for (let i = 0; i < change.update; i++) {
          widgets[index++].update();
        }
      }
    }
  }

  get ymodel(): YDocument<any> | undefined {
    if (this._fileWidget == null) {
      return;
    }
    return this._fileWidget.context.model.sharedModel as YDocument<any>;
  }

  get model(): CommentFileModel | undefined {
    const docWidget = this._fileWidget;
    if (docWidget == null) {
      return;
    }
    return docWidget.model;
  }

  get isUserMode(): boolean {
    return this.userMode;
  }

  get fileWidget(): CommentFileWidget | undefined {
    return this._fileWidget;
  }

  get modelChanged(): ISignal<this, CommentFileWidget | undefined> {
    return this._modelChanged;
  }

  get identityChanged(): ISignal<this, IIdentityChanged> {
    return this._identityChanged;
  }

  get noMark(): ISignal<this, undefined> { // signal to indicate we don't want to mark the editor
    return this._noMark;
  }

  get mark(): ISignal<this, undefined> { // signal to indicate we want to mark the editor
    return this._mark;
  }

  /**
   * Scroll the comment with the given id into view.
   */
  scrollToComment(id: string): void {
    const node = document.getElementById(id);
    if (node == null) {
      return;
    }

    node.scrollIntoView({ behavior: 'smooth' });
  }

  /**
   * Show the widget, make it visible to its parent widget, and emit the
   * `revealed` signal.
   *
   * ### Notes
   * This causes the [[isHidden]] property to be false.
   * If the widget is not explicitly hidden, this is a no-op.
   */
  show(): void { // when the panel is shown, we want to mark the editor always
    if (this.fileWidget != null) {
      const loginfo: Logging.IBasicLog = {
        contextId: this.fileWidget.context.path,
        event: 'ShowCommentPanel',
      }
      logger.info(loginfo)
    }
   
    if (this.isHidden) {
      this.notificationButton?.hide();
      const oldSetting = this.userMode;
      this._mark.emit(undefined);
      this._revealed.emit(undefined);
      super.show();
      this.userMode = oldSetting;
    }
  }


  hide(): void {  // when the panel is hidden, we want to hide the markup only when we are in the user mode
    if (this.fileWidget != null) {
      const loginfo: Logging.IBasicLog = {
        contextId: this.fileWidget.context.path,
        event: 'HideCommentPanel',
      }
      logger.info(loginfo)
    }
    if (!this.isHidden) {
      if (this.userMode){ 
        this._noMark.emit(undefined);
      }
      super.hide();
    }
  }

  /**
   * A signal emitted when a comment is added to the panel.
   */
  get commentAdded(): Signal<this, CommentWidget<any>> {
    return this._commentAdded;
  }

  /**
   * The dropdown menu for comment widgets.
   */
  get commentMenu(): Menu {
    return this._commentMenu;
  }

  /**
   * A signal emitted when the panel is about to be shown.
   */
  get revealed(): Signal<this, undefined> {
    return this._revealed;
  }

  get panelHeader(): PanelHeader {
    return this._panelHeader;
  }

  get awareness(): Awareness | undefined {
    return this.model?.awareness;
  }

  get commentRegistry(): ICommentRegistry {
    return this._commentRegistry;
  }

  get commentWidgetRegistry(): ICommentWidgetRegistry {
    return this._commentWidgetRegistry;
  }

  get pathPrefix(): string {
    return this._pathPrefix;
  }
  set pathPrefix(newValue: string) {
    this._pathPrefix = newValue;
  }

  get sourcePath(): string | null {
    return this._sourcePath;
  }

  mockComment(
    options: CommentFileWidget.IMockCommentOptions,
    index: number
  ): CommentWidget<any> | undefined {
    const model = this.model;
    if (model == null) {
      return;
    }

    const commentFactory = this.commentRegistry.getFactory(options.type);
    if (commentFactory == null) {
      return;
    }

    const comment = commentFactory.createComment({ ...options, text: '' });

    const widgetFactory = this.commentWidgetRegistry.getFactory(options.type);
    if (widgetFactory == null) {
      return;
    }

    const widget = widgetFactory.createWidget(comment, model, options.source);
    if (widget == null) {
      return;
    }

    widget.isMock = true;

    this.fileWidget!.insertWidget(index, widget);
    this._commentAdded.emit(widget);
  }

  updateIdentity(id: number, newName: string): void {
    this._localIdentity.name = newName;

    const model = this.model;
    if (model == null) {
      return;
    }

    model.comments.forEach(comment => {
      if (comment.identity.id === id) {
        model.editComment(
          {
            identity: { ...comment.identity, name: newName }
          },
          comment.id
        );
      }

      comment.replies.forEach(reply => {
        if (reply.identity.id === id) {
          model.editReply(
            {
              identity: { ...reply.identity, name: newName }
            },
            reply.id,
            comment.id
          );
        }
      });
    });

    this.update();
  }

  get button(): NewCommentButton {
    return this._button;
  }

  get localIdentity(): IIdentity {
    return this._localIdentity;
  }

  get commentsPath(): string | null {
    return this._commentsPath
  }

  get filePollManaer(): FilePollManager | undefined {
    return this._filePollManager;
  }

  get notificationButtons(): Map<string, ToolbarButton> {
    return this._notificationButtons  
  }

  get notificationButton(): ToolbarButton | undefined {
    return this._notificationButton
  }  
  private _notificationButton: ToolbarButton | undefined = undefined;
  private _notificationButtons: Map<string, ToolbarButton> = new Map<string, ToolbarButton>();
  private _assistantButtonStates: Map<string, boolean> = new Map<string, boolean>();
  private _savedCommentsInfo: Map<string, Map<string, FrontEndSavedWidgetInfo>> = new Map<string, Map<string, FrontEndSavedWidgetInfo>>();
  private _filePollManager: FilePollManager | undefined = undefined;
  private _commentAdded = new Signal<this, CommentWidget<any>>(this); // sender is the panel class
  private _revealed = new Signal<this, undefined>(this);
  private _commentMenu: Menu;
  private _commentRegistry: ICommentRegistry;
  private _commentWidgetRegistry: ICommentWidgetRegistry;
  private _panelHeader: PanelHeader;
  private _fileWidget: CommentFileWidget | undefined = undefined;
  private _docManager: IDocumentManager;
  private _shell: ILabShell;
  private _modelChanged = new Signal<this, CommentFileWidget | undefined>(this);
  private _identityChanged = new Signal<this, IIdentityChanged>(this);
  private _noMark = new Signal <this, undefined>(this);
  private _mark = new Signal <this, undefined>(this);
  private _pathPrefix: string = 'comments/';
  private _button = new NewCommentButton();
  private _loadingModel = false;
  private _localIdentity: IIdentity;
  private _sourcePath: string | null = null;
  private userMode: boolean = false;
  private _commentsPath: string | null = null;
  private _statusBar: IStatusBar;
  private _saving: SavingStatusComment;
  private _commentTracker: CommentTracker;
  private _commandsDisposables: IDisposable[];
  private _app: JupyterFrontEnd;
  private _handlingPollingChanges: boolean = false;
}

export namespace CommentPanel {
  export interface IOptions {
    docManager: IDocumentManager;
    commentRegistry: ICommentRegistry;
    commentWidgetRegistry: ICommentWidgetRegistry;
    shell: ILabShell;
    renderer: IRenderMimeRegistry;
    statusBar: IStatusBar;
    commentTracker: CommentTracker;
    app: JupyterFrontEnd;
  }
}
