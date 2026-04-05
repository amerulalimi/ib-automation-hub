import logging
from pythonjsonlogger import jsonlogger

from request_context import trace_id_var


class RedactingJsonFormatter(jsonlogger.JsonFormatter):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.keys_to_redact = {
            "password",
            "bot_token",
            "encrypted_bot_token",
            "SecretKey",
            "secret_key",
            "api_key",
            "api_hash",
            "access_token",
            "authorization",
            "Authorization",
            "session_str",
            "encrypted_session",
            "openai_api_key",
            "OPENAI_API_KEY",
        }

    def add_fields(self, log_record, record, message_dict):
        super().add_fields(log_record, record, message_dict)
        tid = trace_id_var.get()
        if tid:
            log_record["trace_id"] = tid
        log_record.setdefault("service", "ib-automation-hub")
        for key, value in log_record.items():
            if key in self.keys_to_redact and value:
                log_record[key] = "***REDACTED***"
            elif isinstance(value, dict):
                self._redact_dict(value)
            elif isinstance(value, list):
                self._redact_list(value)

    def _redact_dict(self, d):
        for k, v in d.items():
            if k in self.keys_to_redact and v:
                d[k] = "***REDACTED***"
            elif isinstance(v, dict):
                self._redact_dict(v)
            elif isinstance(v, list):
                self._redact_list(v)

    def _redact_list(self, l):
        for i, item in enumerate(l):
            if isinstance(item, dict):
                self._redact_dict(item)
            elif isinstance(item, list):
                self._redact_list(item)

def setup_logging():
    logger = logging.getLogger()
    # Remove all existing handlers
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)

    logHandler = logging.StreamHandler()
    formatter = RedactingJsonFormatter(
        '%(timestamp)s %(level)s %(name)s %(message)s',
        timestamp=True
    )
    logHandler.setFormatter(formatter)
    logger.addHandler(logHandler)
    logger.setLevel(logging.INFO)

    # Specific third-party logger levels
    logging.getLogger("uvicorn").setLevel(logging.INFO)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

