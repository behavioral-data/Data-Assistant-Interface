import * as React from 'react';

import { ReactWidget, UseSignal } from '@jupyterlab/apputils';

import { getIdentity, setIdentityName } from './utils';

import { Awareness } from 'y-protocols/awareness';

import { editIcon, refreshIcon, saveIcon } from '@jupyterlab/ui-components';

import { ISignal, Signal } from '@lumino/signaling';
import { ILabShell } from '@jupyterlab/application';
import { CommentPanel, IIdentityChanged } from './panel';
import { IChangedArgs } from '@jupyterlab/coreutils';
import { CommentFileWidget, CommentWidget, logger } from './widget';
import { CommentFileModel } from './model';
import { truncate, truncateFromEnd } from './utils';
import { Logging } from './logging'
import {Switch, makeStyles, FormGroup} from '@material-ui/core';

// import { IIdentity } from './commentformat';
/**
 * This type comes from @jupyterlab/apputils/vdom.ts but isn't exported.
 */
type ReactRenderElement =
  | Array<React.ReactElement<any>>
  | React.ReactElement<any>;

type IdentityProps = {
  awareness: Awareness | undefined;
  panel: CommentPanel;
};

type FileTitleProps = {
  panel: CommentPanel;
};

type PanelButtonProps = {
  panel: CommentPanel;
}

function FileTitle(props: FileTitleProps): JSX.Element {
  const panel = props.panel;

  const [isDirty, SetIsDirty] = React.useState(panel.model?.dirty ?? false);
  const [tooltip, SetTooltip] = React.useState(
    panel.fileWidget?.context.path ?? ''
  );
  const [filename, SetFilename] = React.useState(panel.sourcePath ?? '');

  const dirtySignalHandler = (_: any, change: IChangedArgs<any>): void => {
    if (change.name === 'dirty') {
      SetIsDirty(change.newValue);
    }
  };

  const pathChangedHandler = (_: any, newPath: string): void => {
    SetTooltip(panel.fileWidget?.context.path ?? '');
    SetFilename(panel.sourcePath ?? '');
  };

  const modelChangedHandler = (
    _: any,
    widget: CommentFileWidget | undefined
  ): void => {
    Signal.disconnectAll(dirtySignalHandler);

    SetTooltip(widget?.context.path ?? '');
    SetFilename(panel.sourcePath ?? '');

    if (widget == null) {
      return;
    }

    const model = widget.context.model as CommentFileModel;
    model.stateChanged.connect(dirtySignalHandler);
  };

  React.useEffect(() => {
    panel.modelChanged.connect(modelChangedHandler);
    const fileWidget = panel.fileWidget;
    if (fileWidget != null) {
      fileWidget.context.pathChanged.connect(pathChangedHandler);
    }

    return () => {
      Signal.disconnectAll(modelChangedHandler);
      Signal.disconnectAll(pathChangedHandler);
    };
  });

  return (
    <div title={tooltip}>
      <span className="jc-panelHeader-filename">{truncateFromEnd(filename, 25)}</span>
      {isDirty && <div className="jc-DirtyIndicator" />}
    </div>
  );
}

function UserIdentity(props: IdentityProps): JSX.Element {
  const { awareness, panel } = props;
  const handleClick = () => {
    SetEditable(true);
  };
  const [editable, SetEditable] = React.useState(false);

  const [identityName, SetIdentityName] = React.useState(panel.localIdentity.name);

  const IdentityChangeHandler = (
    _: any, 
    newIdentity: IIdentityChanged): void => {
      SetIdentityName(newIdentity.name);
  }

  React.useEffect(() => {
    panel.identityChanged.connect(IdentityChangeHandler);

    return () => {
      Signal.disconnectAll(IdentityChangeHandler);
    };
  });

  const IdentityDiv = () => {
    if (awareness != undefined) {
      return (
        <div
          contentEditable={editable}
          className={'jc-panelHeader-EditInputArea-' + editable}
          onKeyDown={handleKeydown}
          suppressContentEditableWarning={true}
        >
          {identityName}
        </div>
      );
    }
  };

  const handleKeydown = (event: React.KeyboardEvent): void => {
    const target = event.target as HTMLDivElement;
    if (event.key === 'Escape') {
      SetEditable(false);
      target.blur();
      return;
    } else if (event.key !== 'Enter') {
      return;
    } else if (event.shiftKey) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    if (awareness != null) {
      const newName = target.textContent;
      if (newName == null || newName === '') {
        target.textContent = getIdentity(awareness).name;
      } else {
        setIdentityName(awareness, newName);
        panel.updateIdentity(awareness.clientID, newName);
      }
    }
    SetEditable(false);
  };
  return (
    <div className="jc-panelHeader-identity-container">
      {IdentityDiv()}
      <div onClick={() => handleClick()}>
        <editIcon.react className="jc-panelHeader-editIcon" />
      </div>
    </div>
  );
}

function PanelButtons(props : PanelButtonProps): JSX.Element {
  const panel = props.panel;
  const [userMode, SetUserMode] = React.useState(panel.isUserMode ?? false);
  const [assistantOn, SetAssistantOn] = React.useState(panel.fileWidget?.assistantMode ?? false);
  
  const refresh = async() => {
    
    const fileWidget = panel.fileWidget;
    if (fileWidget == null) {
      return;
    }
    if (panel.commentsPath == null) {
      return;
    }

    if (panel.isUserMode && panel.notificationButton != undefined){
      panel.notificationButton.hide();
      console.log('hide notification button')
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
    const commentContext = await panel.getContext(panel.commentsPath);
    await commentContext.ready;
    // @ts-ignore
    console.log( "Inside refresh: ", commentContext.model.comments.toJSON())

    fileWidget.setContext(commentContext);

    if (panel.isUserMode){
      const numWidgets = fileWidget.numberNewWidgetsToRender();
      const sleepTime = Math.max(300 + Math.random() * 100, 700 * numWidgets + Math.random() * 1000)
      await fileWidget.showRefresh(sleepTime)
      fileWidget.switchToUserMode();
    }else{
      fileWidget.switchToRobotMode();
    }
  };

  React.useEffect(() => {
    panel.identityChanged.connect(IdentityChangeHandler);
    panel.modelChanged.connect(modelChangedHandler);

    return () => {
      Signal.disconnectAll(IdentityChangeHandler);
      Signal.disconnectAll(modelChangedHandler);
    };
  });

  const IdentityChangeHandler = (
    _: any, 
    newIdentity: IIdentityChanged): void => {
      SetUserMode(newIdentity.userMode);
  }

  const modelChangedHandler= (
    _: any,
    widget: CommentFileWidget | undefined
  ): void => {
    SetAssistantOn(widget?.assistantMode ?? false);
  };

  const save = async() => {
    const fileWidget = panel.fileWidget;
    if (fileWidget == null) {
      return;
    }
    console.log("Inside save")
    await fileWidget.context.save(); // void here means we don't care about the result
    // await refresh();
  };

  const showSaveButton = () :React.ReactElement | undefined => {
    if (!userMode) {
      return <div
              data-tooltip="Save comments"
              onClick={async () => {await save()}}
              style={{ float: 'right' }}
            >
              <saveIcon.react className="jc-Button bp3-button bp3-minimal jc-svg-icon" />
            </div>
    }
  }

  const showRefreshButton = () :React.ReactElement | undefined => {
    if (!userMode) {
      return <div 
              data-tooltip="Refresh Suggestions" 
              onClick={async () => {await refresh()}}
              style={{ float: 'right' }}
            >
              <refreshIcon.react className="jc-Button bp3-button bp3-minimal jc-svg-icon"/>
            </div>
    }
  }


  const showAssistantSwitch = () :React.ReactElement | undefined => {
    async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
      SetAssistantOn(event.target.checked);
      if (event.target.checked){
        
        const sleepTime = Math.max(1000 + Math.random() * 500)
        await panel.fileWidget?.showRefresh(sleepTime)
        panel.fileWidget!.assistantMode = true;
        panel.fileWidget?.initialize()
      } else {
        panel.fileWidget!.assistantMode = false;
        panel.fileWidget?.clearWidgets()
        panel.fileWidget?.insertEmpty()
      }
    }
    const useStyles = makeStyles({
      switchBase: {
        '&$checked': {
          color: 'var(--jp-brand-color2)',
        },
        '&$checked + $track': {
          backgroundColor: 'var(--jp-brand-color2)',
        },
      },
      checked: {},
      track: {},
    });
    const classes = useStyles();

    if (userMode) {
      return <FormGroup row> 
             <div className='jc-assistant-switch '>
                <Switch
                  size="small"
                  checked={assistantOn}
                  onChange={handleChange}
                  name="checkedB"
                  classes={{
                    switchBase: classes.switchBase,
                    checked: classes.checked,
                    track: classes.track,
                  }}
                  // color="primary"
                />
                <div className='jc-assistant-label'>Assistant</div>
            </div>
            </FormGroup>
    }
  }
  
  
  
  return <div className="jc-panelHeader-right" style={{display: 'inline-block', paddingRight:'14px'}}>
          {/* Inline style added to align icons */}
          {showSaveButton()}
          {showRefreshButton()}
          {showAssistantSwitch()}
          {/* {SwitchLabels()} */}
        </div>


}

export class PanelHeader extends ReactWidget {
  constructor(options: PanelHeader.IOptions) {
    super();
    const { panel } = options;
    this._panel = panel;
    this.addClass('jc-panelHeader');
  }

  render(): ReactRenderElement {
    return (
      <React.Fragment>
        <div className="jc-panelHeader-left">
          <UseSignal signal={this._renderNeeded}>
            {() => (
              <UserIdentity awareness={this._awareness} panel={this._panel} />
            )}
          </UseSignal>
          <FileTitle panel={this._panel} />
        </div>
        <PanelButtons panel={this._panel} />
        
      </React.Fragment>
    );
  }

  /**
   * A signal emitted when a React re-render is required.
   */
  get renderNeeded(): ISignal<this, void> {
    return this._renderNeeded;
  }

  get awareness(): Awareness | undefined {
    return this._awareness;
  }
  set awareness(newValue: Awareness | undefined) {
    this._awareness = newValue;
    this._renderNeeded.emit(undefined);
  }

  private _awareness: Awareness | undefined;
  private _panel: CommentPanel;
  private _renderNeeded = new Signal<this, void>(this);
}

export namespace PanelHeader {
  export interface IOptions {
    shell: ILabShell;
    panel: CommentPanel;
  }
}
