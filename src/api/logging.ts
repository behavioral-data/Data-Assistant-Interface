
export namespace Logging{

    export interface IBasicLog {
        event: string;
        contextId: string;
    }

    export interface ICommentLog{
        commentId: string;
        text?: string;
    }
    export interface IRefreshLog extends IBasicLog {
        existingComments: ICommentLog[] | null;
    }

    export interface ICommentActionLog extends IBasicLog {
        commentId: string;
        text?: string;
    }
    
}