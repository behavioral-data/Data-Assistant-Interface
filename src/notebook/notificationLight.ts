import { IDisposable, DisposableDelegate } from '@lumino/disposable';
import { ToolbarButton} from '@jupyterlab/apputils';

import { DocumentRegistry } from '@jupyterlab/docregistry';
import {
NotebookPanel,
INotebookModel,
} from '@jupyterlab/notebook';
import { ICommentPanel } from '../api/token';


export class NotificationLightButtonExtension
    implements DocumentRegistry.IWidgetExtension<NotebookPanel, INotebookModel>{
        constructor(panel: ICommentPanel){
            this._panel = panel
        }

    createNew(
        panel: NotebookPanel,
        context: DocumentRegistry.IContext<INotebookModel>
        ): IDisposable {  
    
        // const notificationLight = new Widget();
        // notificationLight.addClass('notification-light');
        const notificationToolBarButton = new ToolbarButton({
            // icon: notTrustedIcon,
            iconClass: 'jc-NotifIndicator',
            onClick: () => {
            console.log('Notification button clicked');
            console.log(this._panel)
            }
        });
        // notificationToolBarButton.node.appendChild(notificationLight.node);

        notificationToolBarButton.hide();
        this._panel.notificationButtons.set(context.path, notificationToolBarButton);
        panel.toolbar.insertBefore('kernelName', 'NotificationLight', notificationToolBarButton);
        return new DisposableDelegate(() => {
            notificationToolBarButton.dispose();
        })
    }
        
    private _panel: ICommentPanel;
}