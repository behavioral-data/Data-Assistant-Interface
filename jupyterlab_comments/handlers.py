from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
from tornado.escape import json_encode, json_decode
import tornado
import requests
import json 
import os.path as osp
import os
import datetime

class RouteHandler(APIHandler):
    # The following decorator should be present on all verb methods (head, get, post,
    # patch, put, delete, options) to ensure only authorized user can request the
    # Jupyter server
    @tornado.web.authenticated
    def post(self):
        if len(self.request.body) == 0:
            self.set_status(400)
            self.finish(json_encode({ "message": "no body provided" }))
            return
        data = json_decode(self.request.body)

        if 'contextId' not in data:
            self.set_status(400)
            self.finish(json_encode({ "message": "no contextId provided" }))
            return
        print("Logging Dir: ", os.getcwd())
        create_dir_if_not_exists('.event_logs')
        log_fname = 'logs_' + get_date_str() + '_' + data['contextId'].replace('/', '_') + '.jsonl'
        with open(osp.join('.event_logs', log_fname), 'a') as f:
            f.write(json.dumps(data) + '\n')
        self.finish(json_encode({"status": "ok", "msg": "done!"}))

def setup_handlers(web_app):
    host_pattern = ".*$"

    base_url = web_app.settings["base_url"]
    # adds jupyterlab-log/log to the end point
    route_pattern = url_path_join(base_url, "jupyterlab-log", "log")
    handlers = [(route_pattern, RouteHandler)]
    web_app.add_handlers(host_pattern, handlers)


def create_dir_if_not_exists(path):
    if not osp.exists(path):
        os.makedirs(path)

def get_date_str():
    return datetime.datetime.now().strftime("%Y-%m-%d")