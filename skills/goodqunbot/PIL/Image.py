# PIL.Image mock
def open(*args, **kwargs):
    raise NotImplementedError("PIL Image.open not implemented in mock")

def new(*args, **kwargs):
    raise NotImplementedError("PIL Image.new not implemented in mock")
