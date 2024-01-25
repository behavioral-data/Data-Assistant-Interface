
import json
from pathlib import Path

from ._version import __version__
import jupyter_server

HERE = Path(__file__).parent.resolve()

with (HERE / "labextension" / "package.json").open() as fid:
    data = json.load(fid)

def _jupyter_labextension_paths():
    return [{
        "src": "labextension",
        "dest": data["name"]
    }]

from .handlers import setup_handlers

def _jupyter_server_extension_points():
    """
    This function returns metadata describing how to load the extension. 
    Usually, this requires a module key with the import path to the extension’s 
    _load_jupyter_server_extension function.
    """
    return [{
        "module": "jupyterlab_comments" 
    }]
    
def _load_jupyter_server_extension(server_app: jupyter_server.serverapp.ServerApp):
    """Registers the API handler to receive HTTP requests from the frontend extension.

    Parameters
    ----------
    server_app: jupyterlab.labapp.LabApp
        JupyterLab application instance
    """
    # config = JupyterLabCodex(config=server_app.config)
    # server_app.web_app.settings["openai"] = config
    setup_handlers(server_app.web_app)
    server_app.log.info("Registered HelloWorld extension at URL path")

# For backward compatibility with notebook server - useful for Binder/JupyterHub
load_jupyter_server_extension = _load_jupyter_server_extension