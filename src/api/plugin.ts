import {
  ILabShell,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { WidgetTracker } from '@jupyterlab/apputils';
import { CommentPanel, CommentCommandIDs} from './panel';
import { CommentWidget } from './widget';
// import  {ButtonExtension} from './togglebutton';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { CommentRegistry, CommentWidgetRegistry } from './registry';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { DocumentRegistry, DocumentWidget } from '@jupyterlab/docregistry';
import { Menu } from '@lumino/widgets';
import { CommentFileModelFactory } from './model';
import {
  ICommentPanel,
  ICommentRegistry,
  ICommentWidgetRegistry
} from './token';
import { IStatusBar } from '@jupyterlab/statusbar';



/**
 * A plugin that provides a `CommentRegistry`
 */
export const commentRegistryPlugin: JupyterFrontEndPlugin<ICommentRegistry> = {
  id: 'jupyterlab-comments:comment-registry',
  autoStart: true,
  provides: ICommentRegistry,
  activate: (app: JupyterFrontEnd) => {
    return new CommentRegistry();
  }
};

/**
 * A plugin that provides a `CommentWidgetRegistry`
 */
export const commentWidgetRegistryPlugin: JupyterFrontEndPlugin<ICommentWidgetRegistry> =
  {
    id: 'jupyterlab-comments:comment-widget-registry',
    autoStart: true,
    provides: ICommentWidgetRegistry,
    activate: (app: JupyterFrontEnd) => {
      return new CommentWidgetRegistry();
    }
  };

export const jupyterCommentingPlugin: JupyterFrontEndPlugin<ICommentPanel> = {
  id: 'jupyterlab-comments:commenting-api',
  autoStart: true,
  requires: [
    ICommentRegistry,
    ICommentWidgetRegistry,
    ILabShell,
    IDocumentManager,
    IRenderMimeRegistry,
    IStatusBar
  ],
  provides: ICommentPanel,
  activate: (
    app: JupyterFrontEnd,
    commentRegistry: ICommentRegistry,
    commentWidgetRegistry: ICommentWidgetRegistry,
    shell: ILabShell,
    docManager: IDocumentManager,
    renderer: IRenderMimeRegistry,
    statusBar: IStatusBar,
  ): CommentPanel => { // <--- this is the return type
    const filetype: DocumentRegistry.IFileType = {
      contentType: 'file',
      displayName: 'comment',
      extensions: ['.comment'],
      fileFormat: 'json',
      name: 'comment',
      mimeTypes: ['application/json']
    };


    const commentTracker = new WidgetTracker<CommentWidget<any>>({
      namespace: 'comment-widgets'
    });

    // this is the CommentPanel class (contains the comment widgets)
    const panel = new CommentPanel({
      app: app,
      commentTracker: commentTracker,
      commentRegistry,
      commentWidgetRegistry,
      docManager,
      shell,
      renderer,
      statusBar
    });

    // Create the directory holding the comments.
    void panel.pathExists(panel.pathPrefix).then(exists => {
      const contents = docManager.services.contents;
      if (!exists) {
        void contents
          .newUntitled({
            path: '/',
            type: 'directory'
          })
          .then(model => {
            void contents.rename(model.path, panel.pathPrefix);
          });
      }
    });
    panel.refreshCommands();

    const commentMenu = new Menu({ commands: app.commands });
    commentMenu.addItem({ command: CommentCommandIDs.editComment });
    app.contextMenu.addItem({
      command: CommentCommandIDs.editComment,
      selector: '.jc-Comment'
    });
    
    if (!panel.isUserMode){
      commentMenu.addItem({ command: CommentCommandIDs.deleteComment });
      
      commentMenu.addItem({ command: CommentCommandIDs.replyToComment });
      commentMenu.addItem({ command: CommentCommandIDs.toggleComment});
      

      app.contextMenu.addItem({ // contextMenu is when you right click on a comment
        command: CommentCommandIDs.deleteComment,
        selector: '.jc-Comment'
      });
      
      app.contextMenu.addItem({
        command: CommentCommandIDs.replyToComment,
        selector: '.jc-Comment'
      });

      app.contextMenu.addItem({
        command: CommentCommandIDs.toggleComment,
        selector: '.jc-Comment'
      });
    }
    

    const modelFactory = new CommentFileModelFactory({
      commentRegistry,
      commentWidgetRegistry,
      commentMenu
    });

    app.docRegistry.addFileType(filetype); // try to remove this line and see what happens
    app.docRegistry.addModelFactory(modelFactory); 

    // Add the panel to the shell's right area.
    panel.showOnShell();


    // Load model for current document when it changes
    shell.currentChanged.connect((_, args) => {
      if (args.newValue != null && args.newValue instanceof DocumentWidget) {
        const docWidget = args.newValue as DocumentWidget;
        docWidget.context.ready
          .then(() => {
            void panel.loadModel(docWidget.context);
          })
          .catch(() => {
            console.warn('Unable to load panel');
          });
      }
    });

    // Update comment widget tracker when model changes
    panel.modelChanged.connect((_, fileWidget) => {
      if (fileWidget != null) {
        fileWidget.widgets.forEach(
          widget => void commentTracker.add(widget as CommentWidget<any>)
        );
        fileWidget.commentAdded.connect(
          (_, commentWidget) => void commentTracker.add(commentWidget)
        );
      }
    });

    // Reveal the comment panel when a comment is added.
    panel.commentAdded.connect((_, comment) => {
      const identity = comment.identity;

      // If you didn't make the comment, ignore it
      // Comparing ids would be better but they're not synchronized across Docs/awarenesses
      if (identity == null || identity.name !== panel.localIdentity.name) {
        return;
      }

      // Automatically opens panel when a document with comments is opened,
      // or when the local user adds a new comment
      if (!panel.isVisible) {
        shell.activateById(panel.id);
        if (comment.text === '') {
          comment.openEditActive();
        }
      }

      panel.scrollToComment(comment.id);
    });

    app.contextMenu.addItem({
      command: CommentCommandIDs.save,
      selector: '.jc-CommentPanel'
    });

    return panel;
  }
};



const plugins: JupyterFrontEndPlugin<any>[] = [
  jupyterCommentingPlugin,
  commentRegistryPlugin,
  commentWidgetRegistryPlugin
];

export default plugins;
