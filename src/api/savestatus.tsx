import { VDomRenderer } from '@jupyterlab/apputils';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';;
import { TextItem } from '@jupyterlab/statusbar';
import { VDomModel } from '@jupyterlab/apputils';
import React from 'react';
import { CommentFileWidget } from './widget';

/**
 * A namespace for SavingStatusComponent statics.
 */
namespace SavingStatusComponent {
    /**
     * The props for the SavingStatusComponent.
     */
    export interface IProps {
      /**
       * The current saving status, after translation.
       */
      fileStatus: string;
    }
}


/**
 * A pure functional component for a Saving status item.
 *
 * @param props - the props for the component.
 *
 * @returns a tsx component for rendering the saving state.
 */
function SavingStatusComponent(
    props: SavingStatusComponent.IProps
  ): React.ReactElement<SavingStatusComponent.IProps> {
    return <TextItem source={props.fileStatus} />;
}

/**
 * The amount of time (in ms) to retain the saving completed message
 * before hiding the status item.
 */
const SAVING_COMPLETE_MESSAGE_MILLIS = 2000;



export class SavingStatusComment extends VDomRenderer<SavingStatusComment.Model> {
    /**
     * Create a new SavingStatus item.
     */
    constructor(opts: SavingStatusComment.IOptions) {
      super(new SavingStatusComment.Model());
      const translator = opts.translator || nullTranslator;
      const trans = translator.load('jupyterlab');
      this._statusMap = {
        completed: trans.__('Saving completed!!'),
        started: trans.__('Saving started!!'),
        failed: trans.__('Saving failed!!')
      };
    }
  
    /**
     * Render the SavingStatus item.
     */
    render(): JSX.Element | null {
      if (this.model === null || this.model.status === null) {
        return null;
      } else {
        return (
          <SavingStatusComponent
            fileStatus={this._statusMap[this.model.status]}
          />
        );
      }
    }
  
    private _statusMap: Record<DocumentRegistry.SaveState, string>;
}


export namespace SavingStatusComment {
  /**
   * A VDomModel for the SavingStatus item.
   */
  export class Model extends VDomModel {
    /**
     * Create a new SavingStatus model.
     */
    constructor() {
      super();

      this._status = null;
      this.widget = null;
    }

    /**
     * The current status of the model.
     */
    get status(): DocumentRegistry.SaveState | null {
      return this._status!;
    }

    /**
     * The current widget for the model. Any widget can be assigned,
     * but it only has any effect if the widget is an IDocument widget
     * known to the application document manager.
     */
    get widget(): CommentFileWidget | null {
      return this._widget;
    }
    set widget(widget: CommentFileWidget | null) {
      const oldWidget = this._widget;
      if (oldWidget?.context?.saveState) {
          oldWidget.context.saveState.disconnect(
            this._onStatusChange
          );
          oldWidget.contextSet.disconnect(this._onCommentContextChanged);
        }

      this._widget = widget;
      if (this._widget === null) {
        this._status = null;
      } else {
         if (this._widget.context?.saveState) {
          this._widget.context.saveState.connect(
            this._onStatusChange
          );
          this._widget.contextSet.connect(this._onCommentContextChanged);
        }
      }
    }

    private _onCommentContextChanged = (
      _: any,
      widget: CommentFileWidget
    ) => {
      this.widget = widget;
    }

    /**
     * React to a saving status change from the current document widget.
     */
    private _onStatusChange = (
      _: any,
      newStatus: DocumentRegistry.SaveState
    ) => {
      this._status = newStatus;

      if (this._status === 'completed') {
        setTimeout(() => {
          this._status = null;
          this.stateChanged.emit(void 0);
        }, SAVING_COMPLETE_MESSAGE_MILLIS);
        this.stateChanged.emit(void 0);
      } else {
        this.stateChanged.emit(void 0);
      }
    };

    private _status: DocumentRegistry.SaveState | null = null;
    private _widget: CommentFileWidget | null = null;
  }

  /**
   * Options for creating a new SaveStatus item
   */
  export interface IOptions {
    /**
     * The application language translator.
     */
    translator?: ITranslator;
  }
}
