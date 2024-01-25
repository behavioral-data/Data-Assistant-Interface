import { ReactWidget, UseSignal } from '@jupyterlab/apputils';
import * as React from 'react';
import { ellipsesIcon } from '@jupyterlab/ui-components';
import { IComment, IIdentity, IReply } from './commentformat';
import { getIdentity, renderCommentTimeString, truncate } from './utils';
import { Menu, Panel } from '@lumino/widgets';
import { ISignal, Signal } from '@lumino/signaling';
import { CommentFileModel } from './model';
import { Context } from '@jupyterlab/docregistry';
import { Message } from '@lumino/messaging';
import {
  IRenderMime,
  IRenderMimeRegistry,
  renderMarkdown
} from '@jupyterlab/rendermime';
import { PartialJSONValue } from '@lumino/coreutils';
import { UserIcons} from './icons';
import {ThumbsupIcon, ThumbsdownIcon} from '@primer/octicons-react'
import useCollapse from 'react-collapsed';
import { caretRightIcon, caretDownIcon} from '@jupyterlab/ui-components';
import ReactLoading from 'react-loading';
import { Logger } from "tslog";
import { Logging } from "./logging";
import { requestAPI } from './loghandler';
/**
 * This type comes from @jupyterlab/apputils/vdom.ts but isn't exported.
 */
export const logger = new Logger({ name: "myLogger" });
logger.attachTransport((logObj) => {
  requestAPI<any>('log', {
    method: 'POST',
    body: JSON.stringify(logObj),
  });
});

type ThumbsResponse = "up" | "down" | "none";

export type FrontEndSavedWidgetInfo = {
  thumbs: ThumbsResponse;
  expandedContent: boolean;
  newComment?: boolean;
}

type ReactRenderElement =
  | Array<React.ReactElement<any>>
  | React.ReactElement<any>;

type JMarkdownRendererProps = {
  text: string;
  registry: IRenderMimeRegistry;
  isAttached: boolean;
};

type SubmitButtonsProps = {
  hidden: boolean | undefined;
};

type ReactMarkdownRendererProps = {
  source: string;
  latexTypesetter: IRenderMime.ILatexTypesetter | null;
  linkHandler: IRenderMime.ILinkHandler | null;
  resolver: IRenderMime.IResolver | null;
  sanitizer: IRenderMime.ISanitizer;
  shouldTypeset: boolean;
};

type CommentProps = {
  renderer: IRenderMimeRegistry;
  comment: IComment;
  className?: string;
  editable?: boolean;
  target?: any;
  preview?: string;
  isAttached: boolean;
  showUser?: boolean;
  userMode?: boolean;
  thumbsUp: ThumbsResponse;
  commentWidget: CommentWidget<any>;
};

type CommentWithRepliesProps = {
  renderer: IRenderMimeRegistry;
  isAttached: boolean;
  collapsed: boolean;
  comment: IComment;
  editID: string;
  activeID: string;
  className?: string;
  preview?: string;
  showUser?: boolean;
  userMode?: boolean;
  thumbsUp: ThumbsResponse;
  commentWidget: CommentWidget<any>;
};

type CommentWrapperProps = {
  commentWidget: CommentWidget<any>;
  className?: string;
  // showUser?: boolean;
  // userMode?: boolean;
  // thumbsUp: ThumbsResponse;
  // contentCollapsed: boolean;
  // editActive: Signal<
};

type ReplyAreaProps = {
  hidden: boolean;
  className?: string;
};

type ReplyProps = {
  reply: IReply;
  renderer: IRenderMimeRegistry;
  isAttached: boolean;
  className?: string;
  editable?: boolean;
};

function Jdiv(props: any): JSX.Element {
  return <div {...props}>{props.children}</div>;
}

function Jspan(props: any): JSX.Element {
  return <span {...props}>{props.children}</span>;
}

function ReactMarkdownRenderer(props: ReactMarkdownRendererProps): JSX.Element {
  const {
    source,
    latexTypesetter,
    linkHandler,
    resolver,
    sanitizer,
    shouldTypeset
  } = props;
  let node: HTMLElement = document.createElement('div');
  const [renderElement, SetRenderElement] = React.useState(<div></div>);

  function isInsideCodeBlock(s: string, index: number): boolean {
    const start_index = s.lastIndexOf("```", index);
    if (start_index === -1) {
      return false;
    }
    const end_index = s.indexOf("```", start_index + 3);
    if (end_index === -1) {
      // Treat an open "```" as being inside a code block
      return true;
    }
    return index < end_index;
  }
  

  const replaceFirstNewlineWithBR = (str: string): string => {
    const splitString = str.split('\n'); // split the string at every newline character
    const strippedArray = splitString.map((item) => item.trim());
  
    let result = ''; // initialize the result string
    let position =  0;
    result += strippedArray[0] == '' ? '<br>' : splitString[0]
    position += splitString[0].length
    for (let i = 1; i < strippedArray.length; i++) {
      if (!isInsideCodeBlock(str, position) && strippedArray[i] == '' && strippedArray[i-1] !== ''){ // check if this is the first newline of a group and it's not an empty line
        result += '<br>'; // add the <br> tag
      }
      else{
        result += '\n'; // add the newline character back to the result string
      }
      position += splitString[i].length + 1
      result += splitString[i]; // add the line to the result string
    }
    return result;
  }

  React.useEffect(() => {
    const newSource = replaceFirstNewlineWithBR(source);
    console.log(newSource)
    const markdownRender = async () => {
      await renderMarkdown({
        host: node as HTMLElement,
        trusted: false,
        source: newSource,
        latexTypesetter,
        linkHandler,
        resolver,
        sanitizer,
        shouldTypeset
      });
      (node as HTMLElement).querySelectorAll('a.jp-InternalAnchorLink').forEach(anchor => {
        anchor.parentNode?.removeChild(anchor);
      });
       // Add copy button to all code blocks
       const codeBlocks = (node as HTMLElement).querySelectorAll('code')
       let index = 0;
       codeBlocks.forEach((codeBlock) => {
        if (codeBlock.innerText.includes('\n')){
          const button = document.createElement('div');
          button.setAttribute('jcEventArea', 'copyButton');
          button.setAttribute('codeIndex', index.toString());
          button.innerText = 'Copy';
          button.className = 'jc-CopyButton';
          const preBlock = codeBlock.parentElement;
          if (preBlock) {
            const wrapper = document.createElement('div');
            wrapper.className = 'jc-CodeBlockWrapper';
            wrapper.appendChild(codeBlock);
            wrapper.appendChild(button);
            preBlock.parentElement?.replaceChild(wrapper, preBlock);
          }
          index++;
        }
      });

      SetRenderElement(
        <div
          className="jc-MarkdownBody"
          dangerouslySetInnerHTML={{
            __html: (node as HTMLElement).innerHTML
          }}
        ></div>
      );
    };
    void markdownRender();

    return () => SetRenderElement(<div></div>);
  }, []);
  return renderElement;
}

/**
 * JMarkdownRender calls the generalizable ReactMarkdownRenderer for our implementation
 */

function JMarkdownRenderer(props: JMarkdownRendererProps): JSX.Element {
  const { registry, isAttached, text } = props;
  return (
    <ReactMarkdownRenderer
      source={text}
      latexTypesetter={registry.latexTypesetter}
      linkHandler={registry.linkHandler}
      resolver={registry.resolver}
      sanitizer={registry.sanitizer}
      shouldTypeset={isAttached}
    />
  );
}

/**
 * SubmitButtons returns the set of buttons (submit and cancel) that a comment/reply uses to take in input
 */

function SubmitButtons(props: SubmitButtonsProps): JSX.Element {
  const { hidden } = props;
  return (
    <Jdiv hidden={hidden} className="jc-SubmitButtons">
      <Jdiv hidden={hidden} className="jc-SubmitButton" jcEventArea="submit">
        Submit
      </Jdiv>
      <Jdiv hidden={hidden} className="jc-CancelButton" jcEventArea="cancel">
        Cancel
      </Jdiv>
    </Jdiv>
  );
}

function JCComment(props: CommentProps): JSX.Element {
  const { comment, editable, preview, renderer, isAttached} = props;
  const className = props.className ?? '';
  // TODO: Replace `UserIcons[0]` with an error icon (maybe just black circle?)
  const icon = UserIcons[comment.identity.icon] ?? UserIcons[0];
  // console.log('JCComment: showUser: '+ props.showUser)
  // console.log('JCComment: userMode: '+ props.userMode)
  // console.log('JCComment: text: '+ comment.text)
  // console.log('JCComment: comment: ', comment)
  // console.log('JCComment: thumbsUps: ', props.thumbsUp)
  const [ isExpanded, setExpanded ] = React.useState(props.commentWidget.expandContent);
  const [thumbsUpClicked, SetThumbsUpClicked] = React.useState(props.thumbsUp === "up" ? true : false);
  const [thumbsDownClicked, SetThumbsDownClicked] = React.useState(props.thumbsUp === "down" ? true : false);
  const { getCollapseProps, getToggleProps} = useCollapse({isExpanded});

  const handleOnClick = ():void => {
    setExpanded(!isExpanded);
    console.log('handleOnClick isExpanded', isExpanded)
  }

  const getTooltip = ():string => {
    const d = new Date(comment.time)
    if (comment.editedTime) {
      const ed = new Date(comment.editedTime)
      return 'Created: '+d.toLocaleString() + '\nModified: '+ed.toLocaleString()
    }
    else {
      return 'Created: '+d.toLocaleString()
    }
  }

  const clickThumbsUp = ():void => {
    console.log('clickThumbsUp')
    
    SetThumbsUpClicked(!thumbsUpClicked)
    SetThumbsDownClicked(false)
  }

  const clickThumbsDown = ():void => {
    console.log('clickThumbsDown')
    SetThumbsUpClicked(false)
    SetThumbsDownClicked(!thumbsDownClicked)
  }

  const sharedClasses = 'jc-button-hover'

  const getThumbsIcon = ():React.ReactElement => {
    if ( props.userMode) {
      return  <Jdiv className="jc-ThumbsContainer">
                <Jspan 
                  className={thumbsUpClicked ? 'jc-ThumbClicked ' + sharedClasses: "jc-Thumb " + sharedClasses} 
                  jcEventArea="thumbsUp" 
                  onClick={clickThumbsUp}
                  style={{padding: '5px'}}>
                   <ThumbsupIcon className="jc-ThumpsUp"/> 
                </Jspan>
                <Jspan className={thumbsDownClicked ? "jc-ThumbClicked " + sharedClasses : "jc-Thumb " + sharedClasses} 
                jcEventArea="thumbsDown" 
                onClick={clickThumbsDown}
                style={{padding: '5px'}}> 
                  <ThumbsdownIcon className="jc-ThumpsDown"/> 
                </Jspan>
              </Jdiv> 
      
    }
    else {
      return <Jspan className="jc-ThumbsContainer" jcEventArea="dropdown"> <ellipsesIcon.react className="jc-button-hover jc-svg-icon"/> </Jspan>
    }

  }
  
  return (
    <Jdiv
      className={'jc-Comment jc-mod-focus-border' + className}
      id={comment.id}
      jcEventArea="other"
      title={getTooltip()}
    >

      <Jdiv className="jc-CommentProfilePicContainer">
        <Jdiv
          className="jc-CommentProfilePic"
          style={{ backgroundColor: (props.showUser || props.userMode) ? comment.identity.color : 'transparent'}}
          jcEventArea="user"
        >
          <icon.react className="jc-MoonIcon" />
        </Jdiv>
      </Jdiv>
      <span className="jc-Nametag">{comment.identity.name}</span>
      {getThumbsIcon()}
      <br />
      {!props.userMode && !comment.editedTime && <span className="jc-Time">{renderCommentTimeString(comment.time)}</span>}
      {!props.userMode && comment.editedTime && <span className="jc-Time"><i>{renderCommentTimeString(comment.editedTime)}</i></span>}
      <Jdiv 
        className="expandIcon" 
        jcEventArea="expand" 
        style={{float: 'right', paddingTop: '5px'}} {...getToggleProps({onClick: handleOnClick})}
        > 
          {isExpanded ? <caretDownIcon.react className="jc-button-hover jc-svg-icon"/> : <caretRightIcon.react className="jc-button-hover jc-svg-icon"/>} 
      </Jdiv>

      {preview != null && (
        <div className="jc-Preview">
          <div className="jc-PreviewBar" />
          <span className="jc-PreviewText">{preview}</span>
        </div>
      )}
        
      <Jdiv 
        className="jc-Body"
        contentEditable={editable}
        suppressContentEditableWarning={true}
        jcEventArea="body"
        onFocus={(event: React.MouseEvent) => {
          const e = event.target as HTMLElement;
          e.innerHTML = `<p>${comment.text}</p>`;
          document.execCommand('selectAll', false, undefined);
        }}
        {...getCollapseProps()}
      >
        <JMarkdownRenderer
          text={comment.text}
          registry={renderer}
          isAttached={isAttached}
        />
      </Jdiv>
      <SubmitButtons hidden={!editable} />
    </Jdiv>
  );
}

function JCReply(props: ReplyProps): JSX.Element {
  const reply = props.reply;
  const className = props.className ?? '';
  const editable = props.editable;
  const icon = UserIcons[reply.identity.icon] ?? UserIcons[0];
  const renderer = props.renderer;
  const isAttached = props.isAttached;

  return (
    <Jdiv
      className={'jc-Comment jc-Reply jc-mod-focus-border' + className}
      id={reply.id}
      jcEventArea="other"
    >
      <Jdiv className="jc-ReplyPicContainer">
        <Jdiv
          className="jc-ReplyPic"
          style={{ backgroundColor: reply.identity.color }}
          jcEventArea="user"
        >
          <icon.react className="jc-MoonIcon" />
        </Jdiv>
      </Jdiv>
      <span className="jc-Nametag">{reply.identity.name}</span>

      <Jspan className="jc-IconContainer" jcEventArea="dropdown">
        <ellipsesIcon.react className="jc-Ellipses" />
      </Jspan>

      <br />

      <div className="jc-ReplySpacer" />

      <Jdiv
        className="jc-Body"
        contentEditable={editable}
        suppressContentEditableWarning={true}
        jcEventArea="body"
        onFocus={(e: React.MouseEvent) => {
          (e.target as HTMLElement).innerHTML = `<p>${reply.text}</p>`;
          document.execCommand('selectAll', false, undefined);
        }}
      >
        <JMarkdownRenderer
          text={reply.text}
          registry={renderer}
          isAttached={isAttached}
        />
      </Jdiv>
      <SubmitButtons hidden={!editable} />
    </Jdiv>
  );
}

function JCCommentWithReplies(props: CommentWithRepliesProps): JSX.Element {
  const { comment, editID, collapsed, renderer, isAttached, preview, showUser} = props;
  const className = props.className ?? '';

  let RepliesComponent = (): JSX.Element => {
    if (!collapsed || comment.replies.length < 4) {
      return (
        <React.Fragment>
          <JCComment
            comment={comment}
            showUser={showUser}
            thumbsUp={props.thumbsUp}
            userMode={props.userMode}
            commentWidget={props.commentWidget}
            isAttached={isAttached}
            editable={editID === comment.id}
            renderer={renderer}
            preview={preview}
          />
          <div className={'jc-Replies'}>
            {comment.replies.map(reply => (
              <JCReply
                reply={reply}
                isAttached={isAttached}
                editable={editID === reply.id}
                renderer={renderer}
                key={reply.id}
              />
            ))}
          </div>
        </React.Fragment>
      );
    } else {
      return (
        <React.Fragment>
          <JCComment
            comment={comment}
            showUser={showUser}
            thumbsUp={props.thumbsUp}
            userMode={props.userMode}
            commentWidget={props.commentWidget}
            isAttached={isAttached}
            editable={editID === comment.id}
            renderer={renderer}
            preview={preview}
          />
          <div className={'jc-Replies'}>
            <Jdiv
              className="jc-Replies-breaker jc-mod-focus-border"
              jcEventArea="collapser"
            >
              <div className="jc-Replies-breaker-left">expand thread</div>
              <div className="jc-RepliesSpacer" />
              <div className="jc-Replies-breaker-right">
                <hr />
                <hr />
                <div className="jc-Replies-breaker-number jc-mod-focus-border">
                  {comment.replies.length - 1}
                </div>
              </div>
            </Jdiv>
            <JCReply
              reply={comment.replies[comment.replies.length - 1]}
              editable={
                editID === comment.replies[comment.replies.length - 1].id
              }
              isAttached={isAttached}
              renderer={renderer}
              key={comment.replies[comment.replies.length - 1].id}
            />
          </div>
        </React.Fragment>
      );
    }
  };

  return (
    <Jdiv className={'jc-CommentWithReplies ' + className}>
      {/* <JCComment
        comment={comment}
        isAttached={isAttached}
        editable={editID === comment.id}
        renderer={renderer}
        preview={preview}
      /> */}
      <RepliesComponent />
    </Jdiv>
  );
}

function JCReplyArea(props: ReplyAreaProps): JSX.Element {
  const hidden = props.hidden;
  const className = props.className || '';

  return (
    <div hidden={hidden} >
      <Jdiv
        className={'jc-ReplyInputArea jc-mod-focus-border' + className}
        contentEditable={true}
        jcEventArea="reply"
        onFocus={() => document.execCommand('selectAll', false, undefined)}
        data-placeholder="give your thoughts and feedback"
      />
      <SubmitButtons hidden={hidden} />
    </div>
  );
}

function JCCommentWrapper(props: CommentWrapperProps): JSX.Element {
  const commentWidget = props.commentWidget;
  const className = props.className || '';
  

  const eventHandler = commentWidget.handleEvent.bind(commentWidget);

  const comment = commentWidget.comment;
  const showUser = commentWidget.showUser === undefined ? true : comment.showUser;
  if (comment ===null) {
    return <div className="jc-Error" />;
  }

  return (
    <div className={className} onClick={eventHandler} onKeyDown={eventHandler} onMouseEnter={eventHandler} onMouseLeave={eventHandler}>
      <JCCommentWithReplies
        isAttached={commentWidget.isAttached}
        comment={comment}
        showUser={showUser}
        thumbsUp={commentWidget.thumbsUp}
        userMode={commentWidget.userMode}
        renderer={commentWidget.renderer}
        commentWidget={commentWidget}
        editID={commentWidget.editID}
        activeID={commentWidget.activeID}
        collapsed={commentWidget.collapsed}
        preview={commentWidget.getPreview()}
      />
      <JCReplyArea hidden={commentWidget.replyAreaHidden} />
    </div>
  );
}

export interface ICommentWidget<T, C extends IComment = IComment> {
  revealReply: () => void;
  openEditActive: () => void;
  editActive: (text: string) => void;
  deleteActive: () => void;
  comment: C;
  target: T;
  replies: IReply[];
  commentID: string;
  identity: IIdentity;
  text: string;
  type: string;
  menu: Menu | undefined;
  replyAreaHidden: boolean;
  activeID: string;
  renderer: IRenderMimeRegistry;
  editID: string;
  renderNeeded: ISignal<this, undefined>;
  handleEvent: (event: React.SyntheticEvent | Event) => void;
  collapsed: boolean;
  isMock: boolean;
}


export class LoadingWidget extends ReactWidget {
  render(): JSX.Element {
    // return <div className="jc-Loading"><p>Loading suggestions ...</p></div>;
    return <div style={{display: 'flex', justifyContent: 'center'}}><ReactLoading type={"bubbles"} color={"#EEEFEE"} height={'20%'} width={'20%'}></ReactLoading></div>
  }
}

export class EmptyWidget extends ReactWidget {
  firstOpen: boolean;
  constructor(firstOpen: boolean) {
    super();
    this.firstOpen = firstOpen;
    this.addClass('jc-EmptyWidget');
  }
  render(): JSX.Element {
    if (this.firstOpen) {
      return <div className="jc-Empty">Toggle the button above (↗) to turn on the assistant!</div>;
    } else {
      return <div className="jc-Empty">No suggestions right now. Check back sometime later in your analysis!</div>;
    }
  }
}
/**
 * A React widget that can render a comment and its replies.
 */
export class CommentWidget<T, C extends IComment = IComment>
  extends ReactWidget
  implements ICommentWidget<T>
{
  constructor(options: CommentWidget.IOptions<T, C>) {
    super();

    const { target, model, comment, contextId, isMock} = options;
    this.id = comment.id;
    this._commentID = comment.id;
    this._activeID = comment.id;
    this._target = target;
    this._model = model;
    this._comment = comment;
    this._contextId = contextId;
    this._showUser = comment.showUser === undefined ? true : comment.showUser;
    this._isMock = isMock ?? false;
    this.node.tabIndex = 0;
    this.addClass('jc-CommentWidget');

  }

  protected onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg);
    if (this.isMock) {
      this.openEditActive();
    }
  }

  toJSON(): PartialJSONValue {
    return this.comment as unknown as PartialJSONValue;
  }

  getPreview(): string | undefined {
    return;
  }

  handleEvent(event: React.SyntheticEvent | Event): void {
    const loginfo: Logging.ICommentActionLog = {
        commentId: this.comment.id,
        contextId: this.contextId,
        text: truncate(this.comment.text, 40),
        event: event.type
      }
    switch (event.type) {
      case 'click':
        this._handleClick(event as React.MouseEvent);
        this.removeClass('jc-CommentWidgetNew')
        this.addClass('jc-CommentWidget')
        this.isNewComment = false;
        break;
      case 'keydown':
        this._handleKeydown(event as React.KeyboardEvent);
        break;
      case 'mouseenter':
        logger.info(loginfo);
        break;
      case 'mouseleave':
        logger.info(loginfo);
      default:
        console.log('event default')
        break;
    }
  }

  /**
   * Handle `click` events on the widget.
   */
  protected _handleClick(event: React.MouseEvent): void {
    switch (CommentWidget.getEventArea(event)) {
      case 'body':
        this._handleBodyClick(event);
        break;
      case 'expand':
        this._handleExpandClick(event);
        break;
      case 'dropdown':
        this._handleDropdownClick(event);
        break;
      case 'reply':
        this._handleReplyClick(event);
        break;
      case 'user':
        this._handleUserClick(event);
        break;
      case 'other':
        this._handleOtherClick(event);
        break;
      case 'collapser':
        this._handleCollapserClick(event);
        break;
      case 'submit':
        this._handleSubmitClick(event);
        break;
      case 'cancel':
        this._handleCancelClick(event);
        break;
      case 'thumbsUp':
        this._handleThumbUpClick(event);
        break;
      case 'thumbsDown':
        this._handleThumbDownClick(event);
        break;
      case 'copyButton':
        this._handleCopyClick(event);
        break;
      case 'none':
        break;
      default:
        break;
    }
  }

  private _handleCopyClick(event: React.MouseEvent): void {
    const target = event.target as HTMLElement;
    const codeIndexStr = target.getAttribute('codeIndex')
    if (codeIndexStr === null) {
      return
    }
    const codeIndex = parseInt(codeIndexStr, 10);
    const code = this.codeBlocks[codeIndex];
    navigator.clipboard.writeText(code).then(() => {
      target.innerText = 'Copied!';
    });
  }
  private _handleExpandClick(event: React.MouseEvent): void {
    this._expandContent = !this._expandContent;
  }

  private _handleThumbUpClick(event: React.MouseEvent): void {


    if (this.thumbsUp === 'up') {
      this.thumbsUp = 'none';
      const loginfo: Logging.ICommentActionLog = {
        commentId: this.comment.id,
        contextId: this.contextId,
        text: truncate(this.comment.text, 40),
        event: 'thumbsUp (set to none)'
      }
      logger.info(loginfo);
    }else{
      this.thumbsUp = 'up';
      const loginfo: Logging.ICommentActionLog = {
        commentId: this.comment.id,
        contextId: this.contextId,
        text: truncate(this.comment.text, 40),
        event: 'thumbsUp (set to up)'
      }
      logger.info(loginfo);

    }
  }

  private _handleThumbDownClick(event: React.MouseEvent): void {
    console.log('_handleThumpDownClick');
    if (this.thumbsUp === 'down') {
      this.thumbsUp = 'none';
      const loginfo: Logging.ICommentActionLog = {
        commentId: this.comment.id,
        contextId: this.contextId,
        text: truncate(this.comment.text, 40),
        event: 'thumbsDown (set to none)'
      }
      logger.info(loginfo);

    }else{
      this.thumbsUp = 'down';
      const loginfo: Logging.ICommentActionLog = {
        commentId: this.comment.id,
        contextId: this.contextId,
        text: truncate(this.comment.text, 40),
        event: 'thumbsDown (set to down)'
      }
      logger.info(loginfo);
    }
  }

  private _handleCollapserClick(event: React.MouseEvent): void {
    this._setClickFocus(event);
    this.collapsed = false;
    this.revealReply();
  }

  /**
   * Collapses and hides the reply area of other comment widgets in the same panel.
   */
  private _collapseOtherComments(): void {
    const parent = this.parent;
    if (parent == null) {
      return;
    }

    const commentFileWidget = parent as CommentFileWidget;
    if (commentFileWidget.expandedCommentID === this.id) {
      return;
    }

    const widgets = commentFileWidget.widgets as CommentWidget<any>[];
    widgets.forEach(widget => {
      if (widget.id !== this.id) {
        widget.collapsed = true;
        widget.replyAreaHidden = true;
        widget.editID = '';
      }
    });

    commentFileWidget.expandedCommentID = this.id;
  }

  /**
   * Scrolls to the comment's target, if it exists
   */
  private _scrollToTarget(): void {
    const element = this.element;
    if (element != null) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  }

  /**
   * Sets the widget focus and active id on click.
   *
   * A building block of other click handlers.
   */
  private _setClickFocus(event: React.MouseEvent): void {
    const oldActive = document.activeElement;
    const target = event.target as HTMLElement;
    const clickID = Private.getClickID(target);
    
    if (clickID != null) {
      this.activeID = clickID;
      if (this.userMode){
        const loginfo: Logging.ICommentActionLog = {
          commentId: this.comment.id,
          contextId: this.contextId,
          text: truncate(this.comment.text, 40),
          event: 'clickFocus'
        }
        logger.info(loginfo);
      }
    }

    if (oldActive == null || !this.node.contains(oldActive)) {
      this.node.focus();
    }

    this._collapseOtherComments();

  }

  /**
   * Handle a click on the submit button when commenting.
   */
  protected _handleSubmitClick(event: React.MouseEvent): void {
    this._setClickFocus(event);
    const target = event.target as HTMLDivElement;
    event.preventDefault();
    event.stopPropagation();
    const element = target.parentNode!.previousSibling as HTMLDivElement;

    if (element == null) {
      return;
    }

    if (element.classList.contains('jc-ReplyInputArea')) {
      //  reply
      if (!/\S/.test(element.innerText)) {
        return;
      }
      this.model.addReply(
        {
          identity: getIdentity(this.model.awareness),
          text: element.innerText
        },
        this.commentID
      );
      this.editID = '';
      element.textContent = '';
      this.replyAreaHidden = true;
      return;
    }

    if (!/\S/.test(element.innerText)) {
      if (this.isMock) {
        this.dispose();
        return;
      }
      element.innerText = this.text!;
    } else {
      if (this.isMock) {
        this.populate(element.innerText);
        return;
      }
      this.editActive(element.innerText);
    }
    this.editID = '';
  }

  /**
   * Handle a click on the cancel button when commenting.
   */
  protected _handleCancelClick(event: React.MouseEvent): void {
    this._setClickFocus(event);

    const target = event.target as HTMLDivElement;
    event.preventDefault();
    event.stopPropagation();
    if (this.isMock) {
      this.dispose();
    }

    const element = target.parentNode!.previousSibling as HTMLDivElement;
    if (element == null) {
      return;
    }

    if (element.classList.contains('jc-ReplyInputArea')) {
      this.replyAreaHidden = true;
    }
    this.editID = '';
    element.blur();
  }

  /**
   * Handle a click on the dropdown (ellipses) area of a widget.
   */
  protected _handleDropdownClick(event: React.MouseEvent): void {
    this._setClickFocus(event);
    const menu = this.menu;
    if (menu != null && !this.isMock) {
      menu.open(event.pageX, event.pageY);
    }
  }

  /**
   * Handle a click on the user icon area of a widget.
   *
   * ### Note
   * Currently just acts as an `other` click.
   */
  protected _handleUserClick(event: React.MouseEvent): void {
    this._setClickFocus(event);
    this._scrollToTarget();

    // if (this.comment.text !== ''){
    //   this.revealReply();
    // }
    if (!this._userMode){
      console.log('clicked user photo!')
      this.toggleShowUser();
    }
    
  }

  toggleShowUser(): void{
    this._showUser = !this._showUser;
    console.log('show user inside toggleShowUser', this._showUser);
    this.model.editCommentNoTimeStampUpdate({showUser: this._showUser}, this.commentID)
    this._renderNeeded.emit(undefined)
  }

  get showUser(): boolean{
    return this._showUser;
  }
  /**
   * Handle a click on the widget but not on a specific area.
   */
  protected _handleOtherClick(event: React.MouseEvent): void {
    this._setClickFocus(event);

    const target = event.target as HTMLElement;
    const clickID = Private.getClickID(target);
    if (clickID == null) {
      return;
    }

    this.editID = '';

    // if (this.comment.text !== ''){
    //   this.revealReply();
    // }
    this._scrollToTarget();
  }

  /**
   * Handle a click on the widget's reply area.
   */
  protected _handleReplyClick(event: React.MouseEvent): void {
    this._setClickFocus(event);
    this._scrollToTarget();
    if (!this.userMode){
      // this.revealReply();
    }
  }

  /**
   * Handle a click on the widget's body.
   */
  protected _handleBodyClick(event: React.MouseEvent): void {
    this._setClickFocus(event);
    this._scrollToTarget();

    if (this.comment.text !== '' && !this.userMode){
      // this.revealReply();
    }
  }

  /**
   * Handle `keydown` events on the widget.
   */
  protected _handleKeydown(event: React.KeyboardEvent): void {
    if (this.userMode){
      return;
    }
    switch (CommentWidget.getEventArea(event)) {
      case 'reply':
        this._handleReplyKeydown(event);
        break;
      case 'body':
        this._handleBodyKeydown(event);
        break;
      default:
        break;
    }
  }

  /**
   * Handle a keydown on the widget's reply area.
   */
  protected _handleReplyKeydown(event: React.KeyboardEvent): void {
    if (this.userMode){
      return;
    }
    if (event.key === 'Escape') {
      this.replyAreaHidden = true;
      return;
    } else if (event.key === 'Tab') {
      event.preventDefault();
      document.execCommand('insertHTML', false, '&#009');
      return;
    } else if (event.key !== 'Enter') {
      return;
    } else if (event.shiftKey) {
      const target = event.target as HTMLDivElement;
      event.preventDefault();
      event.stopPropagation();
      if (!/\S/.test(target.innerText)) {
        return;
      }

      this.model.addReply(
        {
          identity: getIdentity(this.model.awareness),
          text: target.innerText
        },
        this.commentID
      );

      this.editID = '';
      target.textContent = '';
      this.replyAreaHidden = true;
    }
  }

  /**
   * Handle a keydown on the widget's body.
   */
  protected _handleBodyKeydown(event: React.KeyboardEvent): void {
    if (this.userMode){
      return;
    }
    if (this.editID === '') {
      return;
    }

    const target = event.target as HTMLDivElement;

    switch (event.key) {
      case 'Tab':
        event.preventDefault();
        document.execCommand('insertHTML', false, '&#009');
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();

        if (this.isMock) {
          this.dispose();
          break;
        }

        target.innerText = this.text;
        this.editID = '';
        target.blur();
        break;
      case 'Enter':
        if (!event.shiftKey) {
          break;
        }

        event.preventDefault();
        event.stopPropagation();

        if (this.isMock) {
          if (/\S/.test(target.innerText)) {
            this.populate(target.innerText);
          } else {
            this.dispose();
          }
          break;
        }

        if (!/\S/.test(target.innerText)) {
          target.innerText = this.text!;
        } else {
          this.editActive(target.innerText);
        }

        this.editID = '';
        target.blur();
        break;
      default:
        break;
    }
  }

  populate(text: string): void {
    if (!this.isMock) {
      return;
    }

    let index = 0;
    let node = this.node as ChildNode;
    while (node.previousSibling != null) {
      index++;
      node = node.previousSibling;
    }

    this.hide();

    const { identity, type } = this.comment;
    const source = this.target;

    this.model.insertComment(
      {
        text,
        identity,
        type,
        source
      },
      index
    );

    this.dispose();
  }


  render(): ReactRenderElement {
    return (
      <UseSignal signal={this.renderNeeded}>
        {() => <JCCommentWrapper 
                  commentWidget={this} 
                />
        }
      </UseSignal>
    );
  }

  /**
   * Open the widget's reply area and focus on it.
   */
  revealReply(): void {
    if (this.isAttached === false) {
      return;
    }

    this.replyAreaHidden = false;
    const nodes = this.node.getElementsByClassName(
      'jc-ReplyInputArea'
    ) as HTMLCollectionOf<HTMLDivElement>;
    nodes[0].focus();
  }

  /**
   * Select the body area of the currently active comment for editing.
   */
  openEditActive(): void {
    if (this.isAttached === false) {
      return;
    }

    this.editID = this.activeID;
    const comment = document.getElementById(this.activeID);
    if (comment == null) {
      return;
    }

    const elements = comment.getElementsByClassName(
      'jc-Body'
    ) as HTMLCollectionOf<HTMLDivElement>;
    const target = elements[0];
    target.focus();
  }

  editActive(text: string): void {
    if (this.activeID === this.commentID) {
      this.model.editComment({ text }, this.commentID);
    } else {
      this.model.editReply({ text }, this.activeID, this.commentID);
    }
  }

  /**
   * Delete the currently active comment or reply.
   *
   * ### Notes
   * If the base comment is deleted, the widget will be disposed.
   */
  deleteActive(): void {
    if (this.isAttached === false) {
      return;
    }
    if (this.activeID === this.commentID) {
      this.model.deleteComment(this.commentID);
      this.dispose();
    } else {
      this.model.deleteReply(this.activeID, this.commentID);
    }
  }

  /**
   * The comment object being rendered by the widget.
   */
  get comment(): C {
    if (this.isMock) {
      return this._comment;
    }

    const loc = this.model.getComment(this.commentID);
    return loc ? (loc.comment as C) : this._comment;
  }

  /**
   * The target of the comment (what is being commented on).
   */
  get target(): T {
    return this._target;
  }

  /**
   * Information about the author of the comment.
   */
  get identity(): IIdentity {
    return this.comment.identity;
  }

  /**
   * The type of the comment.
   */
  get type(): string {
    return this.comment.type;
  }

  /**
   * The plain body text of the comment.
   */
  get text(): string {
    return this.comment.text;
  }

  get codeBlocks(): string[] {
    const lines = this.text.split('\n');
    const codeBlocks: string[] = [];
    let inCodeBlock = false;
    let currentBlock: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          codeBlocks.push(currentBlock.join('\n'));
          currentBlock = [];
        }
        inCodeBlock = !inCodeBlock;
      } else if (inCodeBlock) {
        currentBlock.push(line);
      }
    }
    if (inCodeBlock) {
      codeBlocks.push(currentBlock.join('\n'));
    }
    return codeBlocks;
  }
  

  /**
   * An array of replies to the comment.
   */
  get replies(): IReply[] {
    return this.comment.replies;
  }

  /**
   * The ID of the main comment.
   */
  get commentID(): string {
    return this._commentID;
  }

  get model(): CommentFileModel {
    return this._model;
  }

  /**
   * The ID of the last-focused comment or reply.
   */
  get activeID(): string {
    return this._activeID;
  }
  set activeID(newVal: string) {
    if (newVal !== this.activeID) {
      this._activeID = newVal;
      this._renderNeeded.emit(undefined);
    }
  }

  /**
   * Whether to show the reply area or not
   */
  get replyAreaHidden(): boolean {
    return this._replyAreaHidden;
  }
  set replyAreaHidden(newVal: boolean) {
    if (newVal !== this.replyAreaHidden) {
      this._replyAreaHidden = newVal;
      this._renderNeeded.emit(undefined);
    }
  }

  /**
   * A signal emitted when a React re-render is required.
   */
  get renderNeeded(): Signal<this, undefined> {
    return this._renderNeeded;
  }

  get collapsed(): boolean {
    return this._collapsed;
  }
  set collapsed(newVal: boolean) {
    if (newVal !== this.collapsed) {
      this._collapsed = newVal;
      this._renderNeeded.emit(undefined);
    }
  }

  /**
   * The ID of the managed comment being edited, or the empty string if none.
   */
  get editID(): string {
    return this._editID;
  }
  set editID(newVal: string) {
    if (this.editID !== newVal) {
      this._editID = newVal;
      this._renderNeeded.emit(undefined);
    }
  }

  get menu(): Menu | undefined {
    return this.model.commentMenu;
  }

  get renderer(): IRenderMimeRegistry {
    return (this.parent as CommentFileWidget).renderer;
  }

  get isMock(): boolean {
    return this._isMock;
  }
  set isMock(newVal: boolean) {
    this._isMock = newVal;
  }

  get element(): HTMLElement | undefined {
    return;
  }

  get userMode(): boolean {
    return this._userMode;
  }

  set userMode(newVal: boolean) {
    this._userMode = newVal;
  }

  get thumbsUp(): ThumbsResponse {
    return this._thumbsUp;
  }

  set thumbsUp(newVal: ThumbsResponse) {
    this._thumbsUp = newVal;
  }

  get editActiveSignal(): Signal<this, undefined> {
    return this._editActiveSignal;
  }

  get expandContent(): boolean {
    return this._expandContent;
  }

  set expandContent(newVal: boolean) {
    this._expandContent = newVal;
  }

  get isNewComment(): boolean {
    return this._isNewComment;
  }

  set isNewComment(newVal: boolean) {
    if (newVal){
      this.addClass('jc-CommentWidgetNew');
      this.removeClass('jc-CommentWidget')
    }else {
      this.removeClass('jc-CommentWidgetNew')
      this.addClass('jc-CommentWidget');
    }
    this._isNewComment = newVal;
  }

  get contextId(): string {
    return this._contextId;
  }

  set contextId(newVal: string) {
    this._contextId = newVal;
  }

  private _contextId: string;
  private _isNewComment: boolean = false;
  private _userMode: boolean = false;
  private _thumbsUp: ThumbsResponse = "none";
  private _expandContent : boolean = this._userMode ? false : true;
  private _showUser: boolean;
  protected _model: CommentFileModel;
  protected _comment: C;
  private _commentID: string;
  private _target: T;
  private _activeID: string;
  private _replyAreaHidden: boolean = true;
  private _editID: string = '';
  private _renderNeeded: Signal<this, undefined> = new Signal<this, undefined>(
    this
  );
  private _editActiveSignal: Signal<this, undefined> = new Signal<this, undefined>(this);
  private _collapsed: boolean = true;
  private _isMock: boolean;
}

export namespace CommentWidget {
  export interface IOptions<T, C extends IComment = IComment> {
    model: CommentFileModel;
    comment: C;
    target: T;
    contextId: string;
    isMock?: boolean;
  }

  /**
   * A type referring to an area of a `CommentWidget`
   */
  export type EventArea =
    | 'dropdown'
    | 'body'
    | 'user'
    | 'reply'
    | 'other'
    | 'none'
    | 'collapser'
    | 'submit'
    | 'cancel'
    | 'thumbsUp'
    | 'thumbsDown'
    | 'expand'
    | 'copyButton'
    ;

  /**
   * Whether a string is a type of `EventArea`
   */
  export function isEventArea(input: string): input is EventArea {
    return [
      'dropdown',
      'body',
      'user',
      'reply',
      'other',
      'collapser',
      'submit',
      'cancel',
      'thumbsUp',
      'thumbsDown',
      'expand',
      'copyButton'
    ].includes(input);
  }

  /**
   * Gets the `EventArea` of an event on a `CommentWidget`.
   *
   * Returns `none` if the event has no ancestors with the `jcEventArea` attribute,
   * and returns `other` if `jcEventArea` is set but the value is unrecognized.
   *
   * ### Notes
   * Also sets the target of the event to the first ancestor of the target with
   * the `jcEventArea` attribute set.
   */
  export function getEventArea(event: React.SyntheticEvent): EventArea {
    const target = event.target as HTMLElement;
    const areaElement = target.closest('[jcEventArea]');
    if (areaElement == null) {
      return 'none';
    }

    const area = areaElement.getAttribute('jcEventArea');
    if (area == null) {
      return 'other';
    }

    event.target = areaElement;

    return isEventArea(area) ? area : 'other';
  }
}

/**
 * A widget that hosts and displays a list of `CommentWidget`s
 */
export class CommentFileWidget extends Panel {
  renderer: IRenderMimeRegistry;
  
  constructor(
    options: CommentFileWidget.IOptions,
    renderer: IRenderMimeRegistry
  ) {
    super();

    const { context, userMode, assistantMode, savedCommentInfo} = options;
    this._context = context;
    this._userMode = userMode;
    this._assistantMode = assistantMode;
    this._model = context.model as CommentFileModel;
    this._model.widgets = this.widgets as readonly CommentWidget<any>[];
    this._contextSet = new Signal(this);
    this._commentWidgets = this.widgets as CommentWidget<any>[];
    this._savedCommentInfo = savedCommentInfo;
    this.id = `Comments-${context.path}`;
    this.addClass('jc-CommentFileWidget');
    this.renderer = renderer;
  }

  setContext(context: Context): void {
    this._context = context;
    this._model = context.model as CommentFileModel;
    this._model.widgets = this.widgets as readonly CommentWidget<any>[];
    this.id = `Comments-${context.path}`;
    this.contextSet.emit(this);
  }

  get contextSet(){
    return this._contextSet;
  }

  newComments(comments: IComment[]): boolean {
    for (let i = 0; i < this._commentWidgets.length; i++){
      // save into _savedCommentInfo
      if (this._commentWidgets[i] instanceof CommentWidget){
        this._savedCommentInfo.set(this._commentWidgets[i].id, {
            "thumbs": this._commentWidgets[i].thumbsUp, 
            "expandedContent": this._commentWidgets[i].expandContent
          
        });
      }
    }

    let newComments = false;
    for (let i = 0; i < comments.length; i++){
      if (comments[i].showUser === false || comments[i].showUser === undefined){
        continue;
      }
      if (comments[i].showUser === true && this._savedCommentInfo.get(comments[i].id) === undefined){
        newComments = true;
        break;
      }
    }
    return newComments;
  }

  insertComment(comment: IComment, index: number): void {
    const factory = this.model.commentWidgetRegistry.getFactory(comment.type);
    if (factory == null || (!comment.showUser && this._userMode)) {
      return;
    }

    const widget = factory.createWidget(comment, this.model, this.context.path);

    if (widget != null) {
      if (this._userMode){
        const newComment = this._savedCommentInfo.get(widget.id)?.newComment
        widget.isNewComment = newComment === undefined ? true : newComment
      }
      widget.thumbsUp = this._savedCommentInfo.get(widget.id)?.thumbs === undefined ? "none" : this._savedCommentInfo.get(widget.id)!.thumbs;
      widget.expandContent = this._savedCommentInfo.get(widget.id)?.expandedContent === undefined ? true : this._savedCommentInfo.get(widget.id)!.expandedContent;
      widget.userMode = this._userMode;
      this.insertWidget(index, widget);
      this._commentAdded.emit(widget);
    }
  }

  insertEmpty(): void {
    this.insertWidget(0, new EmptyWidget(!this._assistantMode))
  }

  initialize(): void {
    this.clearWidgets();
    console.log( "Inside initialize comments: ", this.model.comments.toJSON())
    console.log(this._savedCommentInfo)

    if ((this._userMode && this._assistantMode) || !this._userMode){
      this.model.comments.forEach(comment => this.addComment(comment));
    }
    if (this.widgets.length === 0 && this._userMode) {
      this.insertEmpty();
    }
  }

  async showRefresh(sleepTime: number){
    function sleep(ms: number) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

      this.clearWidgets()
      this.initializeLoadingWidget();
      await sleep(sleepTime);
      this.removeLoadingWidget();
  }

  clearWidgets(): void {
    while (this._commentWidgets.length > 0) {
      if (this._commentWidgets[0].id != undefined){
        this._savedCommentInfo.set(
          this._commentWidgets[0].id,
          {
            "thumbs": this._commentWidgets[0].thumbsUp, 
            "expandedContent": this._commentWidgets[0].expandContent,
            "newComment": this._commentWidgets[0].isNewComment,
          }
        );
      }
      this.widgets[0].dispose();
    }
  }

  saveWigetsInfo(): void {
    this._savedCommentInfo.clear();
    for (let i = 0; i < this._commentWidgets.length; i++) {
      if (this._commentWidgets[i].id != undefined){
        this._savedCommentInfo.set(
          this._commentWidgets[i].id,
          {
            "thumbs": this._commentWidgets[i].thumbsUp, 
            "expandedContent": this._commentWidgets[i].expandContent,
            "newComment": this._commentWidgets[i].isNewComment,
          }
        );
      }
    }
  }

  numberWidgetsToRender(): number {
    let count = 0
    this.model.comments.forEach(comment => {
      if (comment.showUser || !this._userMode) {
        count++;
      }
    });
    return count;
  }

  numberNewWidgetsToRender(): number {
    let count = 0
    this.model.comments.forEach(comment => {
      const val = this._savedCommentInfo.get(comment.id)
      if (comment.showUser && (val == undefined || val.newComment == true) || !this._userMode) {
        count++;
      }
    });
    return count;
  }

  numberUnseenWidgetsToRender(): number {
    let count = 0
    this.model.comments.forEach(comment => {
      const val = this._savedCommentInfo.get(comment.id)
      if (comment.showUser && (val == undefined) || !this._userMode) {
        count++;
      }
    });
    return count;
  }

  initializeLoadingWidget(): void {
    this.insertWidget(0, new LoadingWidget())
  }

  removeLoadingWidget(): void {
    if (this.widgets[0] instanceof LoadingWidget){
      this.widgets[0].dispose();
    }
  }

  switchToUserMode(): void {
    this._userMode = true;
    console.log("switching to user mode")
    this.initialize()
    // this.initialize()
    // this._commentWidgets.forEach(widget => {
    //   widget.userMode = true
    //   this.updateWidget(widget)
    // })
  }

  switchToRobotMode(): void {
    this._userMode = false;
    console.log("switching to robot mode")
    this.initialize()
    // this.initialize()
    // this._commentWidgets.forEach(widget => {
    //   widget.userMode = false
    //   this.updateWidget(widget)
    // })
  }

  updateWidget(widget: CommentWidget<any>): void {
    // hide widget if in user mode and the widget is not supposed to be shown to the user
    if (widget.userMode && !widget.showUser){
      widget.hide();
    }else if(widget.isHidden){
      widget.show();
    }
  }

  addComment(comment: IComment) {
    this.insertComment(comment, this.widgets.length);
  }

  get model(): CommentFileModel {
    return this._model;
  }

  get context(): Context {
    return this._context;
  }

  get registry(): IRenderMimeRegistry {
    return this.renderer;
  }

  get commentAdded(): ISignal<this, CommentWidget<any>> {
    return this._commentAdded;
  }

  get expandedCommentID(): string | undefined {
    return this._expandedCommentID;
  }
  set expandedCommentID(newVal: string | undefined) {
    this._expandedCommentID = newVal;
  }

  get assistantMode(): boolean {
    return this._assistantMode;
  }

  set assistantMode(newVal: boolean) {
    this._assistantMode = newVal;
  }

  get savedCommentInfo(): Map<string, FrontEndSavedWidgetInfo>{
    return this._savedCommentInfo
  }

  private _assistantMode: boolean;
  private _savedCommentInfo: Map<string, FrontEndSavedWidgetInfo>;
  private _commentWidgets: CommentWidget<any>[];
  private _userMode: boolean;
  private _model: CommentFileModel;
  private _context: Context;
  private _contextSet = new Signal<this, this> (this);
  private _commentAdded = new Signal<this, CommentWidget<any>>(this);
  private _expandedCommentID: string | undefined;
}

export namespace CommentFileWidget {
  export interface IOptions {
    context: Context;
    userMode: boolean;
    assistantMode: boolean;
    savedCommentInfo: Map<string, FrontEndSavedWidgetInfo>;
  }

  export interface IMockCommentOptions {
    identity: IIdentity;
    type: string;
    source: any;
  }
}

namespace Private {
  /**
   * Get the ID of a comment that a target lies within.
   */
  export function getClickID(target: HTMLElement): string | undefined {
    const comment = target.closest('.jc-Comment');
    if (comment == null) {
      return undefined;
    }
    return comment.id;
  }
}

