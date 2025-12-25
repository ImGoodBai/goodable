# PIL mock - 最小实现，仅用于满足 wxauto_lib 的导入需求
# wxauto_lib 使用 PIL 进行图片操作，但我们的项目不使用此功能

class Image:
    """Mock Image class"""
    @staticmethod
    def open(*args, **kwargs):
        raise NotImplementedError("PIL Image.open not implemented in mock")

    @staticmethod
    def new(*args, **kwargs):
        raise NotImplementedError("PIL Image.new not implemented in mock")

class ImageGrab:
    """Mock ImageGrab class"""
    @staticmethod
    def grab(*args, **kwargs):
        raise NotImplementedError("PIL ImageGrab.grab not implemented in mock")

__version__ = "10.0.0.mock"
__all__ = ['Image', 'ImageGrab']
